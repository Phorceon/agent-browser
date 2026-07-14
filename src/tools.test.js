import { TOOL_DEFINITIONS } from './tools.js';

describe('Tool Definitions', () => {
  it('should have all required properties for each tool', () => {
    TOOL_DEFINITIONS.forEach(tool => {
      expect(tool).toHaveProperty('name');
      expect(typeof tool.name).toBe('string');
      expect(tool).toHaveProperty('description');
      expect(typeof tool.description).toBe('string');
      expect(tool).toHaveProperty('parameters');
      expect(typeof tool.parameters).toBe('object');
      expect(tool).toHaveProperty('execute');
      expect(typeof tool.execute).toBe('function');
    });
  });
});