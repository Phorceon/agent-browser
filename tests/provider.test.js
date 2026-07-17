const provider = require('../src/provider');

describe('Provider', () => {
  test('should return expected value when getData is called', () => {
    expect(provider).toBeDefined();
    expect(typeof provider.getData).toBe('function');
    const result = provider.getData();
    expect(result).toBe('some value');
  });
});