/**
 * providers/index.js — Single OpenAI-compatible provider
 *
 * Required env vars in .env:
 *   BASE_URL        – OpenAI-compatible endpoint URL
 *   API_KEY         – auth key (use "none" for local models)
 *   MODEL           – model identifier
 *
 * Optional env vars:
 *   SUPPORTS_VISION – "true" if the model can process images
 *
 * Works with any OpenAI-compatible endpoint:
 *   LiteLLM, Ollama, vLLM, LM Studio, Together, Groq, etc.
 *
 * NOTE: The AI_PROVIDER env var is a display-only label for the TUI
 * header and does NOT affect which provider is used. The actual
 * provider is always this OpenAI-compatible client configured via
 * BASE_URL / API_KEY / MODEL.
 */

import OpenAI from 'openai';

function buildMessages(messages) {
  return messages.map((msg) => {
    // Vision message (screenshot injected by agent after observe/take_screenshot)
    if (msg.__image__) {
      return {
        role: 'user',
        content: [
          ...(msg.textBefore ? [{ type: 'text', text: msg.textBefore }] : []),
          {
            type: 'image_url',
            image_url: {
              url: `data:${msg.imageMimeType};base64,${msg.imageBase64}`,
              detail: 'high',
            },
          },
        ],
      };
    }

    // Assistant message with tool calls
    if (msg.role === 'assistant' && msg.tool_calls) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.tool_calls,
      };
    }

    // Tool result
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: msg.tool_call_id,
        content: msg.content,
      };
    }

    return { role: msg.role, content: msg.content || '' };
  });
}

export function createProvider(overrides = {}) {
  const baseURL = overrides.baseURL || process.env.BASE_URL;
  const apiKey  = overrides.apiKey  || process.env.API_KEY || 'none';
  const model   = overrides.model   || process.env.MODEL;
  const supportsVision = overrides.supportsVision
    ?? (process.env.SUPPORTS_VISION === 'true');

  if (!baseURL) throw new Error('BASE_URL is not set in .env');
  if (!model)   throw new Error('MODEL is not set in .env');

  const client = new OpenAI({ apiKey, baseURL });

  return {
    name: `${model} @ ${baseURL}`,
    supportsVision,

    async chat({ messages, tools, onToken }) {
      const params = {
        model,
        messages: buildMessages(messages),
        stream: true,
        max_tokens: 4096, // Safely within output limits for all models
      };

      if (tools?.length) {
        params.tools = tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description.slice(0, 50), // Truncate to ~50 chars to save tokens
            parameters: t.parameters,
          },
        }));
        params.tool_choice = 'auto';
      }

      const stream = client.beta.chat.completions.stream(params);
      let fullText = '';
      const toolCalls = [];

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullText += delta.content;
          onToken?.(delta.content);
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: '', name: '', arguments: '' };
            if (tc.id && !toolCalls[tc.index].id) toolCalls[tc.index].id = tc.id; // Set ID once to avoid duplication
            if (tc.function?.name)       toolCalls[tc.index].name       = tc.function.name;
            if (tc.function?.arguments)  toolCalls[tc.index].arguments += tc.function.arguments;
          }
        }
      }

      return {
        text: fullText,
        toolCalls: toolCalls
          .filter(tc => tc.name)
          .map(tc => ({
            id: tc.id || `call_${Date.now()}`,
            name: tc.name,
            args: JSON.parse(tc.arguments || '{}'),
          })),
      };
    },
  };
}
