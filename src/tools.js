// ─── evaluate_js safety wrapper ─────────────────────────────────────────────
// WARNING: evaluate_js grants full JavaScript execution in the Node.js process.
// This is intentionally unrestricted but should ONLY be used when no built-in
// tool can accomplish the task. Never run untrusted or LLM-generated code
// without review in production deployments.

const EVAL_MAX_CODE_LENGTH = 4096; // chars — reject extremely long payloads
const EVAL_TIMEOUT_MS = 5000;      // ms — hard-kill runaway scripts

/**
 * Safe wrapper around `new Function(code)()` that enforces:
 *  - Maximum code length to prevent resource abuse
 *  - A timeout so infinite loops cannot hang the agent
 * Logs a clear warning on every invocation.
 */
async function safeEval(code) {
  if (typeof code !== 'string') throw new Error('evaluate_js: code must be a string');
  if (code.length > EVAL_MAX_CODE_LENGTH) {
    throw new Error(`evaluate_js: code exceeds ${EVAL_MAX_CODE_LENGTH} character limit (got ${code.length})`);
  }

  console.warn(`[evaluate_js] WARNING: Executing arbitrary JS (${code.length} chars). This bypasses all safety constraints.`);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`evaluate_js: timed out after ${EVAL_TIMEOUT_MS}ms`));
    }, EVAL_TIMEOUT_MS);

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(code);
      const result = fn();
      // If the result is a thenable (Promise), await it within the timeout
      if (result && typeof result.then === 'function') {
        result.then((val) => { clearTimeout(timer); resolve(val); })
              .catch((err) => { clearTimeout(timer); reject(err); });
      } else {
        clearTimeout(timer);
        resolve(result);
      }
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}


// ─── Tool Definitions (OpenAI function calling format) ─────────────────────

export const TOOL_DEFINITIONS = [
{
name: 'click_at',
description: 'PRIMARY METHOD: Click at pixel coordinates based on visual observation. Use this as your first choice for ALL interactions. ALWAYS include description of what you\'re clicking.',
parameters: {
type: 'object',
properties: {
x: { type: 'integer', description: 'X coordinate (horizontal pixels from left edge, 0=left)' },
y: { type: 'integer', description: 'Y coordinate (vertical pixels from top edge, 0=top)' },
description: { type: 'string', description: 'What element you\'re clicking (e.g., "Submit button at center")' },
},
required: ['x', 'y', 'description'],
},
},
{
name: 'type_focused',
description: 'PRIMARY METHOD: Type text into the currently focused field. Use after click_at() to focus a field. More reliable than CSS selectors.',
parameters: {
type: 'object',
properties: {
text: { type: 'string', description: 'Text to type' },
clear: { type: 'boolean', description: 'Clear field before typing (default: true)' },
},
required: ['text'],
},
},
{
name: 'zoom_region',
description: 'Take a close-up screenshot of a specific region. Use when you need precision for small elements or can\'t see details clearly.',
parameters: {
type: 'object',
properties: {
x: { type: 'integer', description: 'Left edge of region (pixels)' },
y: { type: 'integer', description: 'Top edge of region (pixels)' },
width: { type: 'integer', description: 'Width of region (pixels, max 800)' },
height: { type: 'integer', description: 'Height of region (pixels, max 600)' },
},
required: ['x', 'y', 'width', 'height'],
},
},
{
name: 'interact_mark',
description: 'FALLBACK: Interact with an element using its numeric mark_id. Use ONLY when click_at() fails 3+ times. This is a fallback method, not primary.',
parameters: {
type: 'object',
properties: {
mark_id: { type: 'integer', description: 'The numeric ID shown on the visual badge overlay' },
action: { type: 'string', enum: ['click', 'type', 'hover', 'select', 'check', 'type_and_enter'], description: 'What to do with the element' },
text: { type: 'string', description: 'Text to type, or exact option text/value to select (if action is type or select)' },
},
required: ['mark_id', 'action'],
},
},
  {
    name: 'create_text_file',
    description: 'Create a local text file silently in the background. Extremely useful for dynamically generating cover letters without triggering browser download popups.',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Name of the file (e.g. "cover_letter_company.txt")' },
        content: { type: 'string', description: 'The entire text content to put in the file' },
      },
      required: ['filename', 'content'],
    },
  },
{
name: 'batch_interact',
description: 'FALLBACK: Fill out multiple form fields at once using mark_ids. Use ONLY when vision-first approach fails. Not recommended for primary use.',
parameters: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          description: 'A list of actions to perform in order',
          items: {
            type: 'object',
            properties: {
              mark_id: { type: 'integer' },
              action: { type: 'string', enum: ['click', 'type', 'select', 'check', 'type_and_enter'] },
              text: { type: 'string', description: 'Required if action is type or select' }
            },
            required: ['mark_id', 'action']
          }
        }
      },


      
