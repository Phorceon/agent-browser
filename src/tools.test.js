import { describe, it, expect } from 'vitest';
import { TOOL_DEFINITIONS } from './tools.js';

// ─── Tool Definition Validation ─────────────────────────────────────────────

describe('TOOL_DEFINITIONS', () => {
  it('are a non-empty array', () => {
    expect(Array.isArray(TOOL_DEFINITIONS)).toBe(true);
    expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);
  });

  it('each tool has a unique name', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('each tool has name, description, and parameters', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe('object');
    }
  });

  it('each tool has an execute function', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(typeof tool.execute).toBe('function');
    }
  });
});

// ─── Parameter Schema Guards ────────────────────────────────────────────────

describe('parameter schemas', () => {
  it('required arrays contain only strings that match declared properties', () => {
    for (const tool of TOOL_DEFINITIONS) {
      const propKeys = Object.keys(tool.parameters.properties || {});
      const required = tool.parameters.required || [];
      for (const r of required) {
        expect(propKeys).toContain(r);
      }
    }
  });

  it('every property has a type', () => {
    for (const tool of TOOL_DEFINITIONS) {
      for (const [key, prop] of Object.entries(tool.parameters.properties || {})) {
        expect(typeof prop.type).toBe('string');
      }
    }
  });
});
