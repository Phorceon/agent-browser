import { TOOL_DEFINITIONS } from './tools.js';

describe('TOOL_DEFINITIONS', () => {
  test('each tool should have name, description, and parameters', () => {
    TOOL_DEFINITIONS.forEach(tool => {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('parameters');
    });
  });

  test('parameters should be valid JSON schema objects with properties and required fields', () => {
    TOOL_DEFINITIONS.forEach(tool => {
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toBeDefined();
      expect(tool.parameters.required).toBeDefined();
      expect(Array.isArray(tool.parameters.required)).toBe(true);
    });
  });
});