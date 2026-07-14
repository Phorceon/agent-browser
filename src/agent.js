/**
 * agent.js — The agentic loop
 *
 * Sends user tasks to the AI, handles tool calls in a loop,
 * and keeps going until the task is done. Supports vision via
 * screenshots fed directly into the conversation.
 */

import { TOOL_DEFINITIONS, executeTool } from './tools.js';
import { createProvider } from './providers/index.js';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const MAX_STEPS = parseInt(process.env.MAX_AGENT_STEPS || '150');

const SYSTEM_PROMPT = `You are an AI browser agent using VISION-FIRST approach.

## Mission
Complete tasks by SEEING the screen and clicking/typing. Trust vision first, use code as fallback.

## Core Workflow
1. **observe()** - screenshot + URL/title
2. **click_at(x, y, description)** - click at coordinates (0,0 = top-left)
3. **type_focused(text)** - type into focused field
4. **verify** - observe() again to confirm

## PRIMARY Tools
- click_at(x, y, desc) - PRIMARY click method
- type_focused(text) - type after clicking
- zoom_region(x, y, w, h) - close-up screenshot
- observe() - screenshot + accessibility tree
- get_page_state() - check console errors
- wait_for_load() - wait for page load
- press_key(key) - Enter, Tab, Escape, ArrowRight/Down
- scroll(direction) - down/up/left/right

## Accessibility Tree
- observe() returns elements as ref_1, ref_2, etc.
- Use interact_mark(ref_X) as fallback

## Fallback (only after 3 click_at misses)
- interact_mark(mark_id, action)
- click(selector), type_text(selector, text)

## Form Filling
1. observe() → 2. click_at(field) → 3. type_focused(text) → 4. repeat → 5. observe() verify → 6. click_at(submit)

## Rules
- ✅ click_at first, describe what you're clicking
- ✅ use zoom_region for precision
- ✅ wait_for_load after navigate
- ❌ never skip observe()
- ❌ CSS selectors break on React - use click_at

## Error Recovery
- click_at misses → observe() again, retry (3x)
- stuck → press_key("Escape"), then observe()
- 429 errors → wait and retry automatically

## Multi-Tab
- get_tabs() → switch_to_tab(index) → close_tab(index)

## Skills
- call remember_lesson() to save complex workflows`;

export class Agent {
  constructor(onToken, onToolCall, onToolResult) {
    this.provider = createProvider();
    this.messages = []; // internal message history (provider-agnostic format)
    this.onToken = onToken;
    this.onToolCall = onToolCall;
    this.onToolResult = onToolResult;
    this.aborted = false;
  }

  abort() { this.aborted = true; }

  reset() {
    this.messages = [];
    this.aborted = false;
  }

  /**
   * Execute a single tool call, push results to message history,
   * and handle screenshot/vision messages.
   */
  async _executeToolCall(tc) {
    this.onToolCall?.(tc.name, tc.args);

    let result;
    let execError = null;
    try {
      result = await executeTool(tc.name, tc.args);
      this.onToolResult?.(tc.name, result, null);
    } catch (err) {
      execError = err;
      result = { error: err.message };
      this.onToolResult?.(tc.name, result, err);
    }

    const hasScreenshot = result?.__screenshot__;
    const resultForText = hasScreenshot
      ? { savedTo: result.savedTo, pageContent: result.pageContent || null }
      : result;
    const resultStr = JSON.stringify(resultForText);

    this.messages.push({
      role: 'tool',
      tool_call_id: tc.id,
      name: tc.name,
      content: resultStr,
    });

    if (result?.error) {
      this.messages.push({
        role: 'user',
        content: `SYSTEM WARNING: The tool call '${tc.name}' failed with an error. Before proceeding with next steps, you must: 1. Reflect on why it failed. 2. Choose an alternative approach. 3. Optionally call 'remember_lesson' to document a permanent rule or skill to avoid this class of mistakes in the future.`,
      });
    }

    if (hasScreenshot && result.base64 && this.provider.supportsVision) {
      const desc = result.pageContent
        ? `Screenshot taken. Page: "${result.pageContent.title}" at ${result.pageContent.url}`
        : 'Screenshot taken.';
      this.messages.push({
        __image__: true,
        role: 'user',
        imageBase64: result.base64,
        imageMimeType: result.mimeType || 'image/jpeg',
        textBefore: desc,
      });
    }
  }

  /**
   * Build the system prompt by injecting user context, memory, and skills files.
   */
  _buildFullSystemPrompt() {
    let fullSystemPrompt = SYSTEM_PROMPT;

    try {
      const contextPath = join(process.cwd(), 'user_context.md');
      if (existsSync(contextPath)) {
        const userContext = readFileSync(contextPath, 'utf-8');
        fullSystemPrompt += '\n\n## User Context\nThe following is personal context about the user. Whenever you need details about the user to fill out forms or write text, use this information instead of asking the user:\n\n' + userContext;
      }
    } catch (e) {
      // Silently ignore if file can't be read
    }

    try {
      const memoryPath = join(process.cwd(), 'memory.md');
      if (existsSync(memoryPath)) {
        const memoryContext = readFileSync(memoryPath, 'utf-8');
        fullSystemPrompt += '\n\n## Long-Term Memory\nThese are lessons you have explicitly learned from past mistakes. YOU MUST follow these rules strictly:\n\n' + memoryContext;
      }
    } catch (e) {
      // Silently ignore if file can't be read
    }

    try {
      const skillsDir = join(process.cwd(), 'skills');
      if (existsSync(skillsDir) && statSync(skillsDir).isDirectory()) {
        const skillsFiles = readdirSync(skillsDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
        if (skillsFiles.length > 0) {
          fullSystemPrompt += '\n\n## Loaded Skills\nThe following task-specific skills and workflows are available to you. Follow them precisely when relevant to your task:\n\n';
          for (const file of skillsFiles) {
            const skillContent = readFileSync(join(skillsDir, file), 'utf-8');
            fullSystemPrompt += `### Skill: ${file}\n${skillContent}\n\n`;
          }
        }
      }
    } catch (e) {
      // Silently ignore
    }

    return fullSystemPrompt;
  }

  /**
   * Convert our internal message format to the provider's expected format.
   * Key: handle __image__ messages (vision content from screenshots).
   * Keeps only the single most recent screenshot to minimize token usage.
   */
  _buildProviderMessages() {
    const result = [];

    result.push({ role: 'system', content: this._buildFullSystemPrompt() });

    // Only keep last 10 messages to minimize token usage
    const recentMessages = this.messages.slice(-10);

    // Find the index of the very last image in the window so we can include
    // exactly one screenshot regardless of what follows it.
    let lastImageIndex = -1;
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      if (recentMessages[i].__image__) {
        lastImageIndex = i;
        break;
      }
    }

    for (let i = 0; i < recentMessages.length; i++) {
      const msg = recentMessages[i];

      if (msg.__image__) {
        // Only include the most recent image; drop older ones
        if (i === lastImageIndex) {
          result.push({
            role: 'user',
            __image__: true,
            imageBase64: msg.imageBase64,
            imageMimeType: msg.imageMimeType || 'image/jpeg',
            textBefore: msg.textBefore || 'Latest screenshot',
          });
        }
        continue;
      }

      // Truncate all tool results to 500 chars max
      if (msg.role === 'tool') {
        const truncated = msg.content?.slice(0, 500) || '';
        result.push({
          ...msg,
          content: truncated + (msg.content?.length > 500 ? '... [truncated]' : ''),
        });
        continue;
      }

      result.push(msg);
    }

    return result;
  }

  async run(userMessage) {
    this.aborted = false;
    this.messages.push({ role: 'user', content: userMessage });

    let steps = 0;

    while (steps < MAX_STEPS && !this.aborted) {
      steps++;

      const providerMessages = this._buildProviderMessages();

      let aiResponse;
      let retries = 0;
      const MAX_RETRIES = 6;
      while (retries <= MAX_RETRIES) {
        try {
          aiResponse = await this.provider.chat({
            messages: providerMessages,
            tools: TOOL_DEFINITIONS,
            systemPrompt: SYSTEM_PROMPT,
            onToken: (tok) => this.onToken?.(tok),
          });
          break; // Success
        } catch (err) {
          const msg = err.message || '';
          const isRetryable = !msg.toLowerCase().includes('exhausted') &&
                              !msg.toLowerCase().includes('insufficient credits') &&
                              !msg.toLowerCase().includes('invalid api key') &&
                              retries < MAX_RETRIES &&
                              !this.aborted;

          if (isRetryable) {
            retries++;
            const backoff = retries * 3000;
            console.log(`\n  [API Error: ${msg.slice(0,100)}. Retrying in ${backoff/1000}s... (attempt ${retries}/${MAX_RETRIES})]`);
            await new Promise(r => setTimeout(r, backoff));
          } else {
            throw new Error(`AI provider error: ${msg}`);
          }
        }
      }

      const { text, toolCalls } = aiResponse;

      // No tool calls — AI is done responding
      if (!toolCalls || toolCalls.length === 0) {
        if (!text || text.trim() === '') {
          // AI output was truncated - auto-retry once
          console.log(`\n  [Output truncated, retrying...]`);
          const retryResponse = await this.provider.chat({
            messages: providerMessages,
            tools: TOOL_DEFINITIONS,
            systemPrompt: SYSTEM_PROMPT,
            onToken: (tok) => this.onToken?.(tok),
          });
          const retryText = retryResponse.text;
          const retryToolCalls = retryResponse.toolCalls;

          if (!retryToolCalls || retryToolCalls.length === 0) {
            if (!retryText || retryText.trim() === '') {
              throw new Error("AI API hit its output limit while thinking and cleanly cut off before it could finish! (Try typing your prompt again).");
            }
            this.messages.push({ role: 'assistant', content: retryText });
            return retryText;
          }
          // Use the retry result and continue processing its tool calls
          this.messages.push({
            role: 'assistant',
            content: retryText || null,
            tool_calls: retryToolCalls.map(tc => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: JSON.stringify(tc.args) },
            })),
          });
          for (const tc of retryToolCalls) {
            if (this.aborted) break;
            await this._executeToolCall(tc);
          }
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        this.messages.push({ role: 'assistant', content: text });
        return text;
      }

      // Store assistant message with tool calls
      this.messages.push({
        role: 'assistant',
        content: text || null,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });

      // Execute each tool call
      for (const tc of toolCalls) {
        if (this.aborted) break;
        await this._executeToolCall(tc);
      }

      // Brief delay between steps to avoid hammering the API
      await new Promise(r => setTimeout(r, 1500));
    }

    if (this.aborted) {
      return 'Agent was aborted.';
    }
    return 'Agent reached maximum steps.';
  }
}
