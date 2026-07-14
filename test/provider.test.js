const provider = require('../src/provider');

describe('Provider', () => {
  it('should process valid data', () => {
    const data = { key: 'value' };
    const result = provider.process(data);
    expect(result).toBeDefined();
  });

  it('should return null for null input', () => {
    const result = provider.process(null);
    expect(result).toBeNull();
  });
});