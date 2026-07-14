import { TOOL_DEFINITIONS } from './tools.js';

describe('TOOL_DEFINITIONS', () => {
  it('should have all required properties for each tool', () => {
    TOOL_DEFINITIONS.forEach(tool => {
      if (!tool.name || typeof tool.name !== 'string') {
        throw new Error('Tool missing name or name is not a string');
      }
      if (!tool.description || typeof tool.description !== 'string') {
        throw new Error('Tool missing description or description is not a string');
      }
      if (!tool.parameters || typeof tool.parameters !== 'object') {
        throw new Error('Tool missing parameters or parameters is not an object');
      }
      // Check parameters structure
      const params = tool.parameters;
      if (params.type !== 'object') {
        throw new Error('Tool parameters type should be object');
      }
      if (!params.properties || typeof params.properties !== 'object') {
        throw new Error('Tool parameters missing properties');
      }
      if (!Array.isArray(params.required)) {
        throw new Error('Tool parameters missing required array');
      }
    });
  });
});
