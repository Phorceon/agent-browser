import { TOOL_DEFINITIONS } from './tools.js';

describe('TOOL_DEFINITIONS', () => {
  it('should be an array of tool definitions', () => {
    expect(Array.isArray(TOOL_DEFINITIONS)).toBe(true);
    TOOL_DEFINITIONS.forEach(tool => {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('parameters');
    });
  });

  it('should include create_text_file with valid structure', () => {
    const createTextFileTool = TOOL_DEFINITIONS.find(t => t.name === 'create_text_file');
    expect(createTextFileTool).toBeDefined();
    expect(createTextFileTool.description).toContain('file');
    expect(createTextFileTool.parameters.type).toBe('object');
    expect(createTextFileTool.parameters.properties).toHaveProperty('filename');
    expect(createTextFileTool.parameters.properties).toHaveProperty('content');
    expect(createTextFileTool.parameters.required).toContain('filename');
    expect(createTextFileTool.parameters.required).toContain('content');
  });
});