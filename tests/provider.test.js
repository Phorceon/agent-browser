const provider = require('../src/provider');

describe('Provider', () => {
  test('should return expected value when getData is called', () => {
    expect(provider).toBeDefined();
    const result = provider.getData();
    expect(result).toBe('some value');
  });
});