import { createProvider } from './index.js';

describe('createProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.BASE_URL;
    delete process.env.MODEL;
    delete process.env.API_KEY;
    delete process.env.SUPPORTS_VISION;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create a provider with given overrides', () => {
    const provider = createProvider({
      baseURL: 'http://example.com',
      model: 'test-model',
      apiKey: 'test-key',
      supportsVision: true,
    });
    expect(provider.name).toBe('test-model @ http://example.com');
    expect(provider.supportsVision).toBe(true);
  });

  it('should throw error when baseURL is not provided and not in env', () => {
    expect(() => createProvider({ model: 'test-model' })).toThrow('BASE_URL is not set in .env');
  });

  it('should throw error when model is not provided and not in env', () => {
    expect(() => createProvider({ baseURL: 'http://example.com' })).toThrow('MODEL is not set in .env');
  });

  it('should default supportsVision to false when not provided', () => {
    const provider = createProvider({ baseURL: 'http://example.com', model: 'test-model' });
    expect(provider.supportsVision).toBe(false);
  });
});