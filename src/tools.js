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
    
    const role = String(node.role?.value || node.role || '');
    const name = String(node.name?.value || node.name || '');
    
    // Skip empty or non-string names
    if (!name || typeof name !== 'string') return;
    
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
    elements: interactiveElements.slice(0, 20), // Reduced from 50 to 20 for token savings
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
];
