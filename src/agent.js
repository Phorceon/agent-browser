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

const SYSTEM_PROMPT = `You are an autonomous AI browser agent. You control a real Edge browser using VISION-FIRST approach.

## Your Mission
Complete tasks autonomously by SEEING the screen and clicking/typing like a human. You have vision - trust your eyes first, use code only as fallback.

## Core Workflow (MANDATORY)
1. **Start with observe()** - Gets screenshot + page URL/title + optional DOM info
2. **VISUAL INTERACTION (PRIMARY)** - Look at screenshot, click using click_at(x, y, description)
   - Count pixels from top-left corner (0, 0)
   - X increases rightward, Y increases downward
   - Typical viewport: ~1920x1080
3. **Type after clicking** - Use type_focused("text") to type into clicked field
4. **Verify** - observe() again to confirm action succeeded

## Tool Usage Rules - VISION FIRST

**PRIMARY (Use These First):**
- **click_at(x, y, description)** - PRIMARY method for ALL clicks. ALWAYS describe what you're clicking.
- **type_focused(text, clear)** - Type into focused field (use after click_at)
- **zoom_region(x, y, width, height)** - Get close-up of specific area (for precision on small elements)
- **observe()** - Take screenshot + page info
- **press_key(key)** - Keyboard shortcuts (Enter, Tab, Escape, ArrowDown)
- **scroll(direction)** - Navigate pages

**FALLBACK (Use Only When Vision Fails 3+ Times):**
- **interact_mark(mark_id, action)** - Use mark_ids from observe() as last resort
- **batch_interact(actions)** - Batch form filling (fallback only)
- **click(selector, by_text)** - CSS selector clicking (fallback only)
- **type_text(selector, text)** - CSS selector typing (fallback only)

## When to Use Fallback Tools
- Use DOM tools ONLY if click_at misses 3+ times in a row
- Use interact_mark ONLY if you see clear mark_ids in observe() output
- Use CSS selectors ONLY as absolute last resort (they break on React sites)

## Form Filling Strategy (Job Applications)
**Vision-First Approach:**
1. observe() → See the form
2. click_at(x, y, "Field name") → Focus the field
3. type_focused("your text") → Fill it
4. Repeat for each field
5. observe() → Verify before submit
6. click_at(x, y, "Submit button")

**Fallback Approach (if vision fails):**
1. Use interact_mark() with mark_ids from observe()
2. Use batch_interact() for multiple fields at once
3. Use type_text() with CSS selectors as last resort

## Critical Rules
- ✅ ALWAYS try click_at() first - it's the fastest and most reliable
- ✅ ALWAYS describe what you're clicking in 'description' param
- ✅ If uncertain about location, use zoom_region() for precision
- ✅ Wait 2-3 seconds after navigation for page load
- ✅ For job applications: create_text_file() → upload_file()
- ❌ NEVER skip observe() - you need to see the screen
- ❌ NEVER use CSS selectors as primary method (they break on React)
- ❌ NEVER use mark_ids as first choice (vision is better)

## Error Recovery
- If click_at misses: observe() again, adjust coordinates, retry (up to 3 times)
- After 3 misses: Switch to fallback tools (interact_mark or CSS selectors)
- If page changes unexpectedly: observe() to see new state
- If stuck: press_key("Escape") to close popups, then observe()

## Multi-Tab Management
- Use get_tabs() to see all open tabs
- Use switch_to_tab(index) to move between tabs
- Use close_tab(index) when finished with a tab

## Important Notes
- You have vision! Trust your eyes first, use code as fallback
- Screenshot coordinates: (0,0) = top-left, x increases right, y increases down
- When in doubt, observe() and describe what you see, then click
- Be thorough: if asked to apply to 10 jobs, apply to all 10

## Skills and Self-Improvement
- If you figure out a complex workflow, call remember_lesson() to save it
- If you make a mistake, analyze what went wrong and save the lesson`;

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
   * Convert our internal message format to the provider's expected format.
   * Key: handle __image__ messages (vision content from screenshots).
   */
  _buildProviderMessages() {
    const result = [];

    // Insert system prompt for OpenAI-style providers
    let fullSystemPrompt = SYSTEM_PROMPT;
    
    // Inject custom user context if the file exists
    try {
      const contextPath = join(process.cwd(), 'user_context.md');
      if (existsSync(contextPath)) {
        const userContext = readFileSync(contextPath, 'utf-8');
        fullSystemPrompt += '\n\n## User Context\nThe following is personal context about the user. Whenever you need details about the user to fill out forms or write text, use this information instead of asking the user:\n\n' + userContext;
      }
    } catch (e) {
      // Silently ignore if file can't be read
    }

    // Inject permanent learnings and skills
    try {
      const memoryPath = join(process.cwd(), 'memory.md');
      if (existsSync(memoryPath)) {
        const memoryContext = readFileSync(memoryPath, 'utf-8');
        fullSystemPrompt += '\n\n## Long-Term Memory\nThese are lessons you have explicitly learned from past mistakes. YOU MUST follow these rules strictly:\n\n' + memoryContext;
      }
    } catch (e) {
      // Silently ignore if file can't be read
    }

    // Inject explicit Skills
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

    result.push({ role: 'system', content: fullSystemPrompt });

    // Find the index of the VERY LAST image message in the history
    let lastImageIndex = -1;
    let lastObserveIndex = -1;
    
    for (let i = 0; i < this.messages.length; i++) {
      if (this.messages[i].__image__) {
        lastImageIndex = i;
      }
      if (this.messages[i].role === 'tool' && (this.messages[i].name === 'observe' || this.messages[i].name === 'get_page_content')) {
        lastObserveIndex = i;
      }
    }

    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i];
if (msg.__image__) {
if (i === lastImageIndex) {
// This is the latest screenshot; keep the image data
result.push({
role: 'user',
__image__: true,
imageBase64: msg.imageBase64,
imageMimeType: msg.imageMimeType || 'image/jpeg',
textBefore: msg.textBefore || '',
});
} else {
          // Older screenshots: strip the image to save tokens!
          result.push({
            role: 'user',
            content: `${msg.textBefore || ''}\n[Previous screenshot omitted to save context length]`
          });
        }
      } else if (msg.role === 'tool' && (msg.name === 'observe' || msg.name === 'get_page_content')) {
        if (i === lastObserveIndex) {
          result.push(msg); // Keep latest full snapshot
        } else {
          // Truncate older bulky snapshots to avoid 429 rate limits
          result.push({
            ...msg,
            content: `{"status": "Prior complete page snapshot omitted to save token limits. Please rely on your latest observe() call."}`
          });
        }
      } else if (msg.role === 'tool' && msg.content && msg.content.length > 2000) {
        // For other massive tool outputs (evaluate_js, find_elements, etc), only keep full if very recent
        if (i < this.messages.length - 15) {
          result.push({
            ...msg,
            content: `{"status": "Old result omitted to save context limit.", "preview": ${JSON.stringify(msg.content.slice(0, 500) + '...')}}`
          });
        } else {
          result.push(msg);
        }
      } else {
        result.push(msg);
      }
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
          if ((msg.includes('429') || msg.toLowerCase().includes('timeout') || msg.includes('50') || msg.toLowerCase().includes('rate')) && retries < MAX_RETRIES && !this.aborted) {
            retries++;
            const backoff = retries * 3000; // 3s, 6s, 9s...
            console.log(`\n  [API Error: ${msg}. Retrying in ${backoff/1000}s...]`);
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
          // Use the retry result
          this.messages.push({ 
            role: 'assistant', 
            content: retryText || null, 
            tool_calls: retryToolCalls.map(tc => ({ 
              id: tc.id, 
              type: 'function', 
              function: { name: tc.name, arguments: JSON.stringify(tc.args) } 
            })) 
          });
          // Continue processing retry tool calls
          for (const tc of retryToolCalls) {
            if (this.aborted) break;
            this.onToolCall?.(tc.name, tc.args);
            let result;
            try {
              result = await executeTool(tc.name, tc.args);
              this.onToolResult?.(tc.name, result, null);
            } catch (err) {
              result = { error: err.message };
              this.onToolResult?.(tc.name, result, err);
            }
            const hasScreenshot = result?.__screenshot__;
            const resultForText = hasScreenshot ? { savedTo: result.savedTo, pageContent: result.pageContent || null } : result;
            const resultStr = JSON.stringify(resultForText);
            this.messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.name, content: resultStr });
            if (result && result.error) {
              this.messages.push({ 
                role: 'user', 
                content: `SYSTEM WARNING: The tool call '${tc.name}' failed with an error. Before proceeding with next steps, you must: 1. Reflect on why it failed. 2. Choose an alternative approach. 3. Optionally call 'remember_lesson' to document a permanent rule or skill to avoid this class of mistakes in the future.` 
              });
            }
            if (hasScreenshot && result.base64 && this.provider.supportsVision) {
              const desc = result.pageContent ? `Screenshot taken. Page: "${result.pageContent.title}" at ${result.pageContent.url}` : 'Screenshot taken.';
              this.messages.push({ __image__: true, role: 'user', imageBase64: result.base64, imageMimeType: result.mimeType || 'image/jpeg', textBefore: desc });
            }
          }
          await new Promise(r => setTimeout(r, 3000));
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
        // Build the text version of the result (without the huge base64)
        const resultForText = hasScreenshot
          ? { savedTo: result.savedTo, pageContent: result.pageContent || null }
          : result;
        const resultStr = JSON.stringify(resultForText);

        // Add tool result to messages
        this.messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: resultStr,
        });

        // Inject self-improvement directive if execution failed
        if (result && result.error) {
          this.messages.push({
            role: 'user',
            content: `SYSTEM WARNING: The tool call '${tc.name}' failed with an error. Before proceeding with next steps, you must: 1. Reflect on why it failed. 2. Choose an alternative approach. 3. Optionally call 'remember_lesson' to document a permanent rule or skill to avoid this class of mistakes in the future.`
          });
        }

// If this was a screenshot/observe result, inject the image as a vision message
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

      // Throttle: 3 second pause between tool calls (OpenRouter free tier: 20 req/min)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Loop back to let AI process tool results and decide next action
    }

    if (this.aborted) return '(Task stopped by user)';
    return '(Max steps reached — task may be incomplete)';
  }

  getHistory() { return this.messages; }

  /**
   * Hot-swap provider config without restarting.
   * Accepts any subset of: { baseURL, model, apiKey, supportsVision }
   */
  switchProvider(overrides = {}) {
    this.provider = createProvider(overrides);
    return this.provider.name;
  }
}
