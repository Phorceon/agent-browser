describe('Provider', () => {
  it('should handle undefined input gracefully', () => {
    const provider = new Provider();
    expect(() => provider.process(undefined)).not.toThrow();
  });

  it('should process valid input correctly', () => {
    const provider = new Provider();
    const result = provider.process('valid');
    expect(result).toBe('expected');
  });
});