const provider = require('../src/providers');

describe('Provider Module', () => {
  test('creates instance', () => {
    expect(provider).toBeDefined();
    expect(provider).toBeInstanceOf(Function);
    const instance = new provider();
    expect(instance).toBeInstanceOf(provider);
  });
});