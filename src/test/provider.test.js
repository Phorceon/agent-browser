import { Provider } from '../src/provider';

describe('Provider', () => {
  it('should initialize without errors', () => {
    const provider = new Provider();
    expect(provider).toBeDefined();
    expect(provider).toBeInstanceOf(Provider); // Added guard for instance type
  });

  it('should return data', async () => {
    const provider = new Provider();
    const data = await provider.getData();
    expect(data).not.toBeNull();
  });
});