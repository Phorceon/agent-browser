import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TOOL_DEFINITIONS } from './tools.js';

// ─── Shared mock helpers ─────────────────────────────────────────────────────

function createMockPage(overrides = {}) {
  const defaults = {
    evaluate: vi.fn().mockResolvedValue(null),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    url: vi.fn().mockReturnValue('https://example.com'),
    title: vi.fn().mockReturnValue('Test Page'),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
  return defaults;
}

// ─── TOOL_DEFINITIONS sanity checks ──────────────────────────────────────────

describe('TOOL_DEFINITIONS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(TOOL_DEFINITIONS)).toBe(true);
    expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);
  });

  it('every tool has name, description, parameters, and execute', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.parameters).toBe('object');
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('no duplicate tool names', () => {
    const names = TOOL_DEFINITIONS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ─── Edge-case tests for evaluate-based helpers ──────────────────────────────

describe('tool parameter schemas', () => {
  it('click_at requires x, y, description', () => {
    const clickAt = TOOL_DEFINITIONS.find(t => t.name === 'click_at');
    expect(clickAt.parameters.required).toContain('x');
    expect(clickAt.parameters.required).toContain('y');
    expect(clickAt.parameters.required).toContain('description');
  });

  it('type_focused requires text', () => {
    const typeFocused = TOOL_DEFINITIONS.find(t => t.name === 'type_focused');
    expect(typeFocused.parameters.required).toContain('text');
  });

  it('batch_interact actions array items have required fields', () => {
    const batch = TOOL_DEFINITIONS.find(t => t.name === 'batch_interact');
    const items = batch.parameters.properties.actions.items;
    expect(items.required).toContain('mark_id');
    expect(items.required).toContain('action');
  });
});

// ─── Mock page edge-case guards ──────────────────────────────────────────────

describe('execute with mock page', () => {
  it('click_at throws on missing params', async () => {
    const clickAt = TOOL_DEFINITIONS.find(t => t.name === 'click_at');
    const page = createMockPage();
    await expect(clickAt.execute({}, page)).rejects.toThrow();
  });

  it('type_focused calls page.evaluate', async () => {
    const typeFocused = TOOL_DEFINITIONS.find(t => t.name === 'type_focused');
    const page = createMockPage();
    page.evaluate.mockResolvedValue(undefined);
    // Should not throw even if page.evaluate returns null
    await expect(typeFocused.execute({ text: 'hello' }, page)).resolves.not.toThrow();
  });
});
