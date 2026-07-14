import { createProvider } from './index.js';

describe('createProvider', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.BASE_URL;
    delete process.env.MODEL;
    delete process.env.API_KEY;
    delete process.env.SUPPORTS_VISION;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create a provider with overrides', () => {
    const provider = createProvider({
      baseURL: 'https://api.example.com',
      model: 'gpt-4',
      apiKey: 'test-key',
    });
    expect(provider.name).toBe('gpt-4 @ https://api.example.com');
    expect(provider.supportsVision).toBe(false);
  });

  it('should throw an error if baseURL is not set', () => {
    expect(() => createProvider()).toThrow('BASE_URL is not set in .env');
  });

  it('should throw an error if model is not set', () => {
    expect(() => createProvider()).toThrow('MODEL is not set in .env');
  });
});