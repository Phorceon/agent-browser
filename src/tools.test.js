import { TOOL_DEFINITIONS } from './tools';

describe('tools', () => {
  it('should export TOOL_DEFINITIONS as an array', () => {
    expect(Array.isArray(TOOL_DEFINITIONS)).toBe(true);
  });

  it('should have all tools with required properties and execute functions', () => {
    TOOL_DEFINITIONS.forEach(tool => {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.execute).toBe('function');
    });
  });

  // Example specific tool test for click_at
  it('click_at tool should have x, y, and description as required parameters', () => {
    const clickAt = TOOL_DEFINITIONS.find(tool => tool.name === 'click_at');
    expect(clickAt).toBeDefined();
    expect(clickAt.parameters.required).toContain('x');
    expect(clickAt.parameters.required).toContain('y');
    expect(clickAt.parameters.required).toContain('description');
  });
});
