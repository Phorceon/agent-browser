import { TOOL_DEFINITIONS } from './tools.js';
// If convertToSimplifiedTree is not exported, comment out its tests and re-import when exposed.
// For now we test what we can via TOOL_DEFINITIONS and any exported helpers.

describe('TOOL_DEFINITIONS', () => {
  test('every tool has name, description, parameters, and required fields', () => {
    expect.assertions(TOOL_DEFINITIONS.length * 4);
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.description).toBe('string');
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe('object');
    }
  });

  test('every tool with required params lists them in properties', () => {
    expect.assertions(TOOL_DEFINITIONS.length);
    for (const tool of TOOL_DEFINITIONS) {
      const props = tool.parameters.properties || {};
      for (const req of (tool.parameters.required || [])) {
        expect(props[req]).toBeDefined();
      }
    }
  });
});

// If convertToSimplifiedTree is exported, test these edge cases:
// import { convertToSimplifiedTree } from './tools.js';
// describe('convertToSimplifiedTree', () => {
//   test('empty nodes array returns zero elements', () => {
//     expect.assertions(2);
//     const result = convertToSimplifiedTree([]);
//     expect(result.elementCount).toBe(0);
//     expect(result.elements).toHaveLength(0);
//   });
//
//   test('non-interactable nodes are filtered out', () => {
//     expect.assertions(1);
//     const nodes = [
//       { role: { value: 'generic' }, name: { value: 'some text' } },
//       { role: { value: 'statictext' }, name: { value: 'label' } },
//     ];
//     const result = convertToSimplifiedTree(nodes);
//     expect(result.elements).toHaveLength(0);
//   });
//
//   test('nodes with empty or missing name are skipped', () => {
//     expect.assertions(1);
//     const nodes = [
//       { role: { value: 'button' }, name: { value: '' } },
//       { role: { value: 'button' } },
//       { role: { value: 'textbox' }, name: { value: '  ' } },
//     ];
//     const result = convertToSimplifiedTree(nodes);
//     expect(result.elements).toHaveLength(0);
//   });
// });