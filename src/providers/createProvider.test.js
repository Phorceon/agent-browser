import { createProvider } from './index';

// Mock OpenAI client to avoid network calls
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    beta: { chat: { completions: { stream: jest.fn() } } }
  }))
}));

describe('createProvider', () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.BASE_URL;
    delete process.env.API_KEY;
    delete process.env.MODEL;
    delete process.env.SUPPORTS_VISION;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws when BASE_URL is missing and not overridden', () => {
    process.env.MODEL = 'test-model';
    expect(() => createProvider()).toThrow('BASE_URL is not set in .env');
  });

  it('throws when MODEL is missing and not overridden', () => {
    process.env.BASE_URL = 'http://test-url';
    expect(() => createProvider()).toThrow('MODEL is not set in .env');
  });

  it('creates provider with overrides without requiring env vars', () => {
    const provider = createProvider({
      baseURL: 'http://override-url',
      model: 'override-model',
      apiKey: 'override-key'
    });
    expect(provider.name).toBe('override-model @ http://override-url');
  });

  it('uses env vars when no overrides provided', () => {
    process.env.BASE_URL = 'http://env-url';
    process.env.MODEL = 'env-model';
    const provider = createProvider();
    expect(provider.name).toBe('env-model @ http://env-url');
  });

  it('defaults supportsVision to false', () => {
    process.env.BASE_URL = 'http://test';
    process.env.MODEL = 'test';
    const provider = createProvider();
    expect(provider.supportsVision).toBe(false);
  });

  it('respects SUPPORTS_VISION env var', () => {
    process.env.BASE_URL = 'http://test';
    process.env.MODEL = 'test';
    process.env.SUPPORTS_VISION = 'true';
    const provider = createProvider();
    expect(provider.supportsVision).toBe(true);
  });
});