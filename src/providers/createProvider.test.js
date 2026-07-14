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

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should throw an error if BASE_URL is not set', () => {
    process.env.MODEL = 'test-model';
    expect(() => createProvider()).toThrow('BASE_URL is not set in .env');
  });

  it('should throw an error if MODEL is not set', () => {
    process.env.BASE_URL = 'http://test.com';
    expect(() => createProvider()).toThrow('MODEL is not set in .env');
  });

  it('should create a provider with default properties when env vars are set', () => {
    process.env.BASE_URL = 'http://test.com';
    process.env.MODEL = 'test-model';
    const provider = createProvider();
    expect(provider.name).toBe('test-model @ http://test.com');
    expect(provider.supportsVision).toBe(false);
  });

  it('should create a provider with overrides', () => {
    const provider = createProvider({
      baseURL: 'http://override.com',
      apiKey: 'key',
      model: 'override-model',
      supportsVision: true,
    });
    expect(provider.name).toBe('override-model @ http://override.com');
    expect(provider.supportsVision).toBe(true);
  });
});