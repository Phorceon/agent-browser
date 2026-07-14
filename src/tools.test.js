// Existing tests assumed here; below adds one concrete guard improvement.

import { describe, it, expect } from 'vitest';
import { TOOL_DEFINITIONS } from './tools.js';

// ── Guard: every tool definition has the required structural shape ──

describe('TOOL_DEFINITIONS structural guard', () => {
  it('every tool has name, description, and valid parameters schema', () => {
    for (const tool of TOOL_DEFINITIONS) {
      // Must have a string name and description
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);

      // Must have a JSON-Schema-style parameters object
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toBeDefined();
      expect(typeof tool.parameters.properties).toBe('object');

      // Every required field must exist in properties
      const required = tool.parameters.required ?? [];
      for (const field of required) {
        expect(
          tool.parameters.properties[field],
          `Tool "${tool.name}" lists "${field}" as required but it is missing from properties`,
        ).toBeDefined();
      }

      // No duplicate tool names
      const dupes = TOOL_DEFINITIONS.filter((t) => t.name === tool.name);
      expect(
        dupes.length,
        `Duplicate tool name: "${tool.name}"`,
      ).toBe(1);
    }
  });
});
