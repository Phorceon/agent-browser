/**
 * tools.js — All browser control tools the AI agent can use
 *
 * Each tool has:
 *   - name: string
 *   - description: string (shown to AI)
 *   - parameters: JSON Schema
 *   - execute(params, page): async function
 *
 * Key tool: `observe` — takes screenshot + page content so the AI can SEE the page.
 * This is the primary tool for understanding current state before acting.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import {
  getAllTabs,
  switchToTab,
  newTab,
  closeTab,
  getActivePage,
} from './browser.js';

const HIGHLIGHT = process.env.HIGHLIGHT_ELEMENTS !== 'false';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function highlightElement(page, selector) {
  if (!HIGHLIGHT) return;
  try {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const prev = el.style.outline;
      el.style.outline = '2px solid #ff4444';
      setTimeout(() => { el.style.outline = prev; }, 800);
    }, selector);
  } catch { /* ignore */ }
}

async function drawMarks(page) {
  return await page.evaluate(() => {
    // Visual badge injection disabled for pristine UI
    
    let counter = 1;
    const marksData = [];
    const elements = document.querySelectorAll('button, input, select, textarea, a, label, [role="button"], [role="link"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [tabindex]:not([tabindex="-1"])');
    
    elements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      
      // Check visibility and size. Must be reasonably sized and within viewport!
      if (rect.width >= 5 && rect.height >= 5 && 
          style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' &&
          rect.top >= 0 && rect.left >= 0 && 
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && 
          rect.right <= (window.innerWidth || document.documentElement.clientWidth)) {
          
        el.setAttribute('data-agent-mark-id', counter);
        
        // Visual badge injection bypassed (runs silently)
        
        let nearestQuestion = '';
        if (['input', 'textarea', 'select'].includes(el.tagName.toLowerCase())) {
          if (el.id) {
            const label = document.querySelector(`label[for="${el.id}"]`);
            if (label) nearestQuestion = label.innerText.trim();
          }
          if (!nearestQuestion) {
            const container = el.closest('div, li, fieldset, label');
            if (container) {
              const textNode = container.querySelector('label, legend, span.label-text, p') || container;
              nearestQuestion = textNode.innerText.replace(el.innerText || '', '').trim().split('\n')[0].slice(0, 100);
            }
          }
        }

        let optionsArr = undefined;
        if (el.tagName.toLowerCase() === 'select') {
          optionsArr = Array.from(el.options).map(o => (o.text || o.value).trim()).filter(Boolean).slice(0, 15);
        }

        const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        marksData.push({
          mark_id: counter,
          tag: el.tagName.toLowerCase(),
          type: el.type || undefined,
          name: el.name || undefined,
          id: el.id || undefined,
          text: text,
          context: nearestQuestion || undefined,
          options: optionsArr
        });
        
        counter++;
      }
    });
    return marksData;
  });
}

async function clearMarks(page) {
  // Bypassed (badges are disabled)
}

/**
 * Build a simplified DOM snapshot that's useful for the AI without being massive.
 * Captures: title, url, headings, links, buttons, inputs, and visible text blocks.
 */
async function getDOMSnapshot(page) {
return await page.evaluate(() => {
const MAX_TEXT = 3000; // Reduced from 8000 to save tokens
const getVisible = (el) => {
const style = window.getComputedStyle(el);
return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
};

const truncate = (str, max = 120) =>
str?.length > max ? str.slice(0, max) + '…' : str;

const results = {
url: window.location.href,
title: document.title,
headings: [],
links: [],
buttons: [],
inputs: [],
selects: [],
textBlocks: [],
};

// Headings
document.querySelectorAll('h1,h2,h3,h4').forEach(h => {
if (getVisible(h)) {
results.headings.push({ tag: h.tagName.toLowerCase(), text: truncate(h.innerText?.trim()) });
}
});

// Links
document.querySelectorAll('a[href]').forEach(a => {
if (getVisible(a) && a.innerText?.trim()) {
results.links.push({
text: truncate(a.innerText.trim()),
href: a.href.slice(0, 150),
});
}
});

// Buttons
document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').forEach(btn => {
if (getVisible(btn)) {
const text = btn.innerText?.trim() || btn.value || btn.getAttribute('aria-label') || '';
if (text) results.buttons.push(truncate(text));
}
});

// Inputs
document.querySelectorAll('input:not([type="hidden"]), textarea').forEach(inp => {
if (getVisible(inp)) {
results.inputs.push({
type: inp.type || 'text',
name: inp.name || inp.id || inp.getAttribute('aria-label') || inp.placeholder || '',
placeholder: inp.placeholder || '',
ariaLabel: inp.getAttribute('aria-label') || '',
role: inp.getAttribute('role') || '',
value: truncate(inp.value || '', 50),
});
}
});

// Selects
document.querySelectorAll('select').forEach(sel => {
if (getVisible(sel)) {
const opts = Array.from(sel.options).map(o => o.text).slice(0, 10);
results.selects.push({ name: sel.name || sel.id || '', options: opts });
}
});

// Main text content - reduced size
const body = document.body?.innerText || '';
results.textBlocks = body.slice(0, MAX_TEXT);

return results;
});
}

/**
 * Get accessibility tree via CDP - Comet-style approach
 * Returns simplified YAML with ref_XX IDs for element references
 */
async function getAccessibilityTree(page) {
  try {
    // Get CDP session from the page's underlying context
    const context = page.context();
    const cdpSession = await context.newCDPSession(page);
    
    // Enable accessibility domain
    await cdpSession.send('Accessibility.enable');
    
    // Get full accessibility tree
    const result = await cdpSession.send('Accessibility.getFullAXTree');
    const axTree = result.nodes || [];
    
    // Close CDP session
    cdpSession.detach();
    
    // Convert to simplified format with ref_XX IDs
    const simplified = convertToSimplifiedTree(axTree);
    return simplified;
  } catch (e) {
    console.log(`[accessibility] Failed, falling back: ${e.message}`);
    return null;
  }
}

/**
 * Convert accessibility tree to simplified format with ref_XX IDs
 */
function convertToSimplifiedTree(nodes) {
  const interactableRoles = ['button', 'textbox', 'combobox', 'checkbox', 'radio', 'link', 'menuitem', 'tab', 'searchbox'];
  const interactiveElements = [];
  let counter = 1;
  
  // Flatten and filter the tree
  function processNode(node, depth = 0) {
    if (!node) return;
    
    const role = node.role?.value || node.role || '';
    const name = node.name?.value || node.name || '';
    
    // Check if interactable
    const isInteractable = interactableRoles.some(r => 
      role.toLowerCase().includes(r)
    );
    
    if (isInteractable && name && name.trim()) {
      const refId = `ref_${counter++}`;
      interactiveElements.push({
        ref: refId,
        role: role,
        label: name.trim().slice(0, 80),
        description: node.description?.value || node.description || '',
        value: node.value?.value || node.value || '',
        focused: node.focused || false,
      });
    }
    
    // Process children
    if (node.children) {
      node.children.forEach(child => processNode(child, depth + 1));
    }
  }
  
  nodes.forEach(node => processNode(node));
  
  return {
    type: 'accessibility_tree',
    elementCount: interactiveElements.length,
    elements: interactiveElements.slice(0, 50), // Limit to 50 for token savings
  };
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
      required: ['actions'],
    },
  },
  {
    name: 'get_tabs',
    description: 'Get all open tabs in the browser with their index, title, and URL.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'switch_to_tab',
    description: 'Switch the active tab to a specific tab by index (from get_tabs).',
    parameters: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: 'Tab index from get_tabs' },
      },
      required: ['index'],
    },
  },
  {
    name: 'new_tab',
    description: 'Open a new browser tab, optionally navigating to a URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to (optional)' },
      },
      required: [],
    },
  },
  {
    name: 'close_tab',
    description: 'Close a tab by index.',
    parameters: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: 'Tab index to close' },
      },
      required: ['index'],
    },
  },
  {
    name: 'navigate',
    description: 'Navigate the current tab to a URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL including https://' },
      },
      required: ['url'],
    },
  },
  {
    name: 'go_back',
    description: 'Go back in the browser history of the current tab.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'go_forward',
    description: 'Go forward in the browser history of the current tab.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
{
name: 'get_page_content',
description: 'FALLBACK: Get the current page\'s content via DOM. Use ONLY when observe() screenshot is insufficient. Can timeout on React sites.',
parameters: { type: 'object', properties: {}, required: [] },
},
{
name: 'click',
description: 'FALLBACK: Click an element using CSS selector. Use ONLY when click_at() fails 3+ times. CSS selectors break on React sites.',
parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector OR text to find (e.g. "button:has-text(Sign In)" or "#submit-btn")',
        },
        by_text: {
          type: 'boolean',
          description: 'If true, find element by its text content instead of CSS selector',
        },
      },
      required: ['selector'],
    },
  },
{
name: 'type_text',
description: 'FALLBACK: Type text into an input field using CSS selector. Use ONLY when type_focused() fails. CSS selectors break on React sites.',
parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the input field' },
        text: { type: 'string', description: 'Text to type' },
        clear_first: { type: 'boolean', description: 'Clear existing content before typing (default true)' },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'press_key',
    description: 'Press a keyboard key. Use for Enter, Tab, Escape, ArrowDown, etc.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name e.g. "Enter", "Tab", "Escape", "ArrowDown", "Control+a"' },
      },
      required: ['key'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page or scroll to a specific element.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'], description: 'Scroll direction' },
        amount: { type: 'integer', description: 'Pixels to scroll (default 500)' },
        selector: { type: 'string', description: 'Optional: scroll into view of this element' },
      },
      required: ['direction'],
    },
  },
  {
    name: 'wait',
    description: 'Wait for a fixed time or for an element to appear on the page.',
    parameters: {
      type: 'object',
      properties: {
        ms: { type: 'integer', description: 'Milliseconds to wait (default 1000)' },
        selector: { type: 'string', description: 'If provided, wait for this element to appear instead' },
      },
      required: [],
    },
  },
  {
    name: 'select_option',
    description: 'Select an option from a <select> dropdown.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the <select> element' },
        value: { type: 'string', description: 'Option value or label to select' },
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'upload_file',
    description: 'Upload a file to a file input element. Provide the selector for the <input type="file"> and the absolute path to the file.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the file input element' },
        file_path: { type: 'string', description: 'Absolute local file path to the file to upload' },
      },
      required: ['selector', 'file_path'],
    },
  },
  {
    name: 'fill_form',
    description: 'Fill multiple form fields at once. Provide field selector + value pairs.',
    parameters: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          description: 'Array of {selector, value} pairs to fill',
          items: {
            type: 'object',
            properties: {
              selector: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['selector', 'value'],
          },
        },
      },
      required: ['fields'],
    },
  },
  {
    name: 'hover',
    description: 'Hover over an element (useful for dropdown menus).',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of element to hover' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'evaluate_js',
    description: 'Run custom JavaScript on the page and return the result. Use for complex interactions or data extraction.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to evaluate. Use return statement for values.' },
      },
      required: ['code'],
    },
  },
  {
    name: 'observe',
    description: 'PRIMARY TOOL: Take a screenshot of the current page AND get its content (text, buttons, inputs, links). Call this whenever you need to understand what is currently on screen. The screenshot lets you see the visual layout; the content gives you element details to interact with. Call this after every navigation or major action to confirm the current state.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'take_screenshot',
    description: 'Take a screenshot only (no page content). Use `observe` instead unless you specifically only need the screenshot.',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Optional filename (without path/extension)' },
      },
      required: [],
    },
  },
  {
    name: 'click_at',
    description: 'Click at specific (x, y) pixel coordinates on the page. Use when you can see from the screenshot exactly where to click but cannot find a CSS selector for it.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'integer', description: 'X coordinate in pixels' },
        y: { type: 'integer', description: 'Y coordinate in pixels' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'get_element_text',
    description: 'Get the text content of a specific element.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'find_elements',
    description: 'Find all elements matching a selector. Returns count and text of each.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to find all matching elements' },
        limit: { type: 'integer', description: 'Max elements to return (default 20)' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'read_clipboard',
    description: 'Read the current text contents of the system clipboard (the equivalent of Cmd+V or Paste). Use this to read links or text you just copied.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'write_clipboard',
    description: 'Write text to the system clipboard (the equivalent of Cmd+C or Copy).',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to save to your local clipboard' },
      },
      required: ['text'],
    },
  },
  {
    name: 'remember_lesson',
    description: 'Create a permanent skill or log a lesson learned from a mistake. Use this whenever you make an error, figure out a complex UI, or need to save a specific rule so you do not repeat errors in the future. This creates a dedicated skill file.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'A short, descriptive title (e.g., "Handling Greenhouse Forms", "Solving Login Mistake")' },
        lesson: { type: 'string', description: 'The detailed lesson or rule you must follow in the future. Be explicit about what NOT to do and what TO do.' },
      },
      required: ['title', 'lesson'],
    },
  },
  {
    name: 'update_memory',
    description: 'Update the permanent memory.md file with accomplishments, state changes, or summaries of what you have done. Use this to permanently track progress on long-running workflows (like which companies you have applied to, or what forms you finished) so that you remember for the next session.',
    parameters: {
      type: 'object',
      properties: {
        memory_addition: { type: 'string', description: 'The text snippet to append to your permanent memory.' },
      },
      required: ['memory_addition'],
    },
  },
];

// ─── Tool Executor ─────────────────────────────────────────────────────────────

export async function executeTool(toolName, params) {
  const page = await getActivePage();

  switch (toolName) {
    case 'get_tabs': {
      const tabs = await getAllTabs();
      return { tabs };
    }

    case 'switch_to_tab': {
      await switchToTab(params.index);
      const page2 = await getActivePage();
      return { switched_to: { index: params.index, url: page2.url(), title: await page2.title() } };
    }

    case 'new_tab': {
      const p = await newTab(params.url);
      return { opened: { url: p.url(), title: await p.title().catch(() => '') } };
    }

    case 'close_tab': {
      await closeTab(params.index);
      return { closed: params.index };
    }

    case 'navigate': {
      let url = params.url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return { navigated_to: page.url(), title: await page.title() };
    }

    case 'go_back': {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
      return { url: page.url() };
    }

    case 'go_forward': {
      await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 });
      return { url: page.url() };
    }

    case 'get_page_content': {
      const snapshot = await getDOMSnapshot(page);
      return snapshot;
    }

    case 'click': {
      let { selector, by_text } = params;
      let locator;
      if (by_text) {
        locator = page.getByText(selector);
      } else {
        locator = page.locator(selector);
      }
      await locator.first().scrollIntoViewIfNeeded({ timeout: 10000 });
      await locator.first().click({ timeout: 10000, force: true, delay: 50 + Math.random() * 100 });
      return { clicked: selector };
    }

    case 'type_text': {
      const { selector, text, clear_first = true } = params;
      const locator = page.locator(selector).first();
      if (clear_first) {
        await locator.clear({ timeout: 10000 });
      }
      await locator.pressSequentially(text, { delay: 10, timeout: 10000 });
      return { typed: text.slice(0, 50) + (text.length > 50 ? '…' : '') };
    }

    case 'press_key': {
      await page.keyboard.press(params.key);
      return { pressed: params.key };
    }

    case 'scroll': {
      if (params.selector) {
        const el = page.locator(params.selector).first();
        await el.scrollIntoViewIfNeeded({ timeout: 10000 });
        return { scrolled_to: params.selector };
      }
      const amount = params.amount || 500;
      const dirs = {
        down: () => page.evaluate((y) => window.scrollBy(0, y), amount),
        up: () => page.evaluate((y) => window.scrollBy(0, -y), amount),
        top: () => page.evaluate(() => window.scrollTo(0, 0)),
        bottom: () => page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)),
      };
      await dirs[params.direction]?.();
      return { scrolled: params.direction, amount };
    }

    case 'wait': {
      if (params.selector) {
        await page.waitForSelector(params.selector, { timeout: 15000 });
        return { appeared: params.selector };
      }
      const ms = params.ms || 1000;
      await page.waitForTimeout(ms);
      return { waited: `${ms}ms` };
    }

    case 'select_option': {
      const locator = page.locator(params.selector);
      await locator.selectOption({ label: params.value }).catch(
        () => locator.selectOption({ value: params.value })
      );
      return { selected: params.value };
    }

    case 'upload_file': {
      const { selector, file_path } = params;
      if (!existsSync(file_path)) {
        throw new Error(`File not found on local disk: ${file_path}`);
      }
      const locator = page.locator(selector).first();
      try {
        await locator.setInputFiles(file_path, { timeout: 3000 });
      } catch (e) {
        // Fallback: If it's a styled button concealing the true input file tag
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 5000 }),
          locator.click({ force: true })
        ]);
        await fileChooser.setFiles(file_path);
      }
      return { uploaded: file_path, to: selector };
    }

    case 'fill_form': {
      const results = [];
      for (const { selector, value } of params.fields) {
        await page.locator(selector).first().pressSequentially(value, { delay: 10, timeout: 5000 });
        results.push({ selector, value });
      }
      return { filled: results.length + ' fields' };
    }

    case 'hover': {
      await page.locator(params.selector).first().hover({ timeout: 5000 });
      return { hovered: params.selector };
    }

    case 'evaluate_js': {
      // Add timeout protection to prevent hanging on complex sites
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('JavaScript evaluation timeout (5s)')), 5000)
      );
      
      const evalPromise = page.evaluate((code) => {
        return new Function(code)();
      }, params.code);
      
      try {
        const result = await Promise.race([evalPromise, timeoutPromise]);
        const strResult = result === undefined ? 'undefined' : (typeof result === 'string' ? result : JSON.stringify(result));
        return { result: strResult.slice(0, 5000) }; // Reduced from 15000
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'observe': {
      // Tab Follower Mechanism: Force the active tab to the forefront
      await page.bringToFront().catch(() => {});
      
      // 1. Take screenshot FIRST (primary, always succeeds)
      mkdirSync('screenshots', { recursive: true });
      const obsPath = join('screenshots', `obs_${Date.now()}.jpeg`);
      await page.screenshot({ path: obsPath, fullPage: false, type: 'jpeg', quality: 30 });
      const obsBase64 = readFileSync(obsPath).toString('base64');
      
      // Get page info once
      const pageUrl = page.url();
      const pageTitle = await page.title().catch(() => 'Unknown');
      
      // 2. Try accessibility tree via CDP (primary), fall back to DOM snapshot
      let obsContent = { url: pageUrl, title: pageTitle };
      
      try {
        // Try accessibility tree with timeout (Comet-style)
        const axPromise = getAccessibilityTree(page);
        const axResult = await Promise.race([
          axPromise,
          new Promise(resolve => setTimeout(() => resolve(null), 4000))
        ]);
        
        if (axResult && axResult.elements && axResult.elements.length > 0) {
          obsContent = {
            url: pageUrl,
            title: pageTitle,
            accessibility_tree: axResult,
          };
        } else {
          // Fallback to DOM snapshot if accessibility tree fails or is empty
          const domPromise = getDOMSnapshot(page);
          const fallbackContent = { url: pageUrl, title: pageTitle };
          obsContent = await Promise.race([
            domPromise,
            new Promise(resolve => setTimeout(() => resolve(fallbackContent), 3000))
          ]);
        }
      } catch (e) {
        // Both failed - return minimal info, vision still works
        console.log(`[observe] DOM and accessibility failed, using minimal info: ${e.message}`);
      }
      
      return {
        __screenshot__: true,
        base64: obsBase64,
        mimeType: 'image/jpeg',
        savedTo: obsPath,
        pageContent: obsContent,
      };
    }

    case 'take_screenshot': {
      mkdirSync('screenshots', { recursive: true });
      const name = params.filename || `screenshot_${Date.now()}`;
      const ssPath = join('screenshots', `${name}.png`);
      await page.screenshot({ path: ssPath, fullPage: false });
      const ssBase64 = readFileSync(ssPath).toString('base64');
      return {
        __screenshot__: true,
        base64: ssBase64,
        mimeType: 'image/png',
        savedTo: ssPath,
      };
    }

case 'click_at': {
      const { x, y, description } = params;
      
      // Validate coordinates are within viewport
      const viewport = page.viewportSize();
      if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) {
        return { 
          error: `Coordinates (${x}, ${y}) outside viewport (${viewport.width}x${viewport.height})` 
        };
      }
      
      await page.mouse.click(x, y);
      return { 
        clicked_at: { x, y }, 
        description: description || 'No description',
        viewport: `${viewport.width}x${viewport.height}`
      };
    }

    case 'type_focused': {
      const { text, clear = true } = params;
      
      // Clear the field if requested
      if (clear) {
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Backspace');
      }
      
      // Type with natural delay
      await page.keyboard.type(text, { delay: 10 });
      return { typed: text.slice(0, 100) };
    }

    case 'zoom_region': {
      const { x, y, width, height } = params;
      
      // Clamp dimensions to prevent huge screenshots
      const clampedWidth = Math.min(width, 800);
      const clampedHeight = Math.min(height, 600);
      
      // Take cropped screenshot
      mkdirSync('screenshots', { recursive: true });
      const zoomPath = join('screenshots', `zoom_${Date.now()}.jpeg`);
      
      await page.screenshot({
        path: zoomPath,
        clip: { x, y, width: clampedWidth, height: clampedHeight },
        type: 'jpeg',
        quality: 50, // Higher quality for zoom
      });
      
      const zoomBase64 = readFileSync(zoomPath).toString('base64');
      
      return {
        __screenshot__: true,
        base64: zoomBase64,
        mimeType: 'image/jpeg',
        savedTo: zoomPath,
        region: { x, y, width: clampedWidth, height: clampedHeight },
      };
    }

    case 'get_element_text': {
      const text = await page.locator(params.selector).first().innerText({ timeout: 5000 });
      return { text };
    }

    case 'interact_mark': {
      const { mark_id, action, text } = params;
      const locator = page.locator(`[data-agent-mark-id="${mark_id}"]`).first();
      await locator.scrollIntoViewIfNeeded({ timeout: 10000 });
      
      if (action === 'click') {
        await locator.click({ timeout: 5000, force: true, delay: 50 + Math.random() * 100 });
        return { clicked_mark: mark_id };
      } else if (action === 'type') {
        await locator.pressSequentially(text, { delay: 10 });
        return { typed_into_mark: mark_id, text };
      } else if (action === 'select') {
        await locator.selectOption(text).catch(() => locator.selectOption({ label: text }));
        return { selected_mark: mark_id, value: text };
      } else if (action === 'type_and_enter') {
        await locator.pressSequentially(text, { delay: 10, timeout: 10000 });
        // Wait 1.5s for React/Greenhouse dropdown network query to load results natively in backend
        await page.waitForTimeout(1500);
        await locator.press('Enter');
        return { typed_and_entered_mark: mark_id, text };
      } else if (action === 'check') {
        await locator.setChecked(true, { timeout: 3000 }).catch(() => locator.click({ force: true }));
        return { checked_mark: mark_id };
      } else if (action === 'hover') {
        await locator.hover({ timeout: 3000 });
        return { hovered_mark: mark_id };
      }
      throw new Error(`Unsupported action: ${action}`);
    }

    case 'batch_interact': {
      const results = [];
      for (const act of params.actions) {
        const { mark_id, action, text } = act;
        try {
          const locator = page.locator(`[data-agent-mark-id="${mark_id}"]`).first();
          await locator.scrollIntoViewIfNeeded({ timeout: 10000 });
          
          if (action === 'click') {
            await locator.click({ timeout: 5000, force: true, delay: 50 + Math.random() * 100 }); // Natural force click
            results.push({ mark_id, status: 'clicked' });
          } else if (action === 'type') {
            await locator.pressSequentially(text, { delay: 10 });
            results.push({ mark_id, status: 'typed' });
          } else if (action === 'select') {
            await locator.selectOption(text).catch(() => locator.selectOption({ label: text }));
            results.push({ mark_id, status: 'selected' });
          } else if (action === 'type_and_enter') {
            await locator.pressSequentially(text, { delay: 10, timeout: 10000 });
            await page.waitForTimeout(1500);
            await locator.press('Enter');
            results.push({ mark_id, status: 'typed_and_entered' });
          } else if (action === 'check') {
            await locator.setChecked(true, { timeout: 3000 }).catch(() => locator.click({ force: true }));
            results.push({ mark_id, status: 'checked' });
          }
        } catch (e) {
          results.push({ mark_id, status: 'error', error: e.message.slice(0, 100) });
          break; // Stop batch if one critical thing fails
        }
      }
      return { batch_results: results };
    }

    case 'create_text_file': {
      mkdirSync('temp_files', { recursive: true });
      const safeName = params.filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const filepath = join(process.cwd(), 'temp_files', safeName);
      writeFileSync(filepath, params.content);
      return { created_file: filepath, info: "File created successfully! You can now use the upload_file tool using this exact filepath." };
    }

    case 'find_elements': {
      const limit = params.limit || 20;
      const items = await page.evaluate(({ sel, lim }) => {
        const els = Array.from(document.querySelectorAll(sel)).slice(0, lim);
        return els.map((el, i) => ({
          index: i,
          text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 100),
          tag: el.tagName.toLowerCase(),
        }));
      }, { sel: params.selector, lim: limit });
      return { found: items.length, elements: items };
    }

    case 'read_clipboard': {
      // MacOS native clipboard read
      const text = execSync('pbpaste', { encoding: 'utf-8' });
      return { clipboard_content: text.slice(0, 25000) };
    }

    case 'write_clipboard': {
      // MacOS native clipboard write
      execSync('pbcopy', { input: params.text });
      return { copied_to_clipboard: true };
    }

    case 'remember_lesson': {
      const { title, lesson } = params;
      const skillsDir = join(process.cwd(), 'skills');
      mkdirSync(skillsDir, { recursive: true });
      const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const skillPath = join(skillsDir, `${sanitizedTitle}.md`);
      
      const content = `# ${title}\n\n${lesson}\n`;
      writeFileSync(skillPath, content, 'utf-8');
      
      return { remembered: true, info: `Skill/Lesson "${title}" saved permanently to skills/${sanitizedTitle}.md.` };
    }

    case 'update_memory': {
      const memoryPath = join(process.cwd(), 'memory.md');
      const timestamp = new Date().toISOString().slice(0, 10);
      const content = `\n### Activity Update (${timestamp})\n${params.memory_addition}\n`;
      appendFileSync(memoryPath, content, 'utf-8');
      return { remembered: true, info: `Successfully appended your progress update to memory.md!` };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
