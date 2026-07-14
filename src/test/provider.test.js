import { Provider } from '../src/provider';

describe('Provider', () => {
  let provider;

  beforeEach(() => {
    provider = new Provider();
  });

  it('should return data when called', () => {
    const data = provider.getData();
    expect(data).toBeDefined();
  });

  it('should handle errors gracefully', () => {
    expect(() => provider.throwError()).toThrow();
  });
});