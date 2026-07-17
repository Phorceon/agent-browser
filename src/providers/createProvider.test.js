import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProvider } from './index.js';

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      beta: {
        chat: {
          completions: {
            stream: vi.fn().mockReturnValue({
              async *[Symbol.asyncIterator]() {},
            }),
          },
        },
      },
    })),
  };
});

describe('createProvider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('should throw when baseURL is not provided', () => {
    delete process.env.BASE_URL;
    process.env.MODEL = 'test-model';
    expect(() => createProvider({})).toThrow(
      'BASE_URL is not set in .env'
    );
  });

  it('should throw when model is not provided', () => {
    delete process.env.MODEL;
    expect(() => createProvider({ baseURL: 'https://api.example.com' })).toThrow('MODEL is not set in .env');
  });

  it('should use overrides over env vars', () => {
    process.env.BASE_URL = 'https://env.example.com';
    process.env.MODEL = 'env-model';
    const provider = createProvider({
      baseURL: 'https://override.example.com',
      model: 'override-model',
    });
    expect(provider.name).toBe('override-model @ https://override.example.com');
  });

  it('should set supportsVision from override', () => {
    process.env.BASE_URL = 'https://api.example.com';
    process.env.MODEL = 'test-model';
    const provider = createProvider({ supportsVision: true });
    expect(provider.supportsVision).toBe(true);
  });

  it('should set supportsVision from env var', () => {
    process.env.BASE_URL = 'https://api.example.com';
    process.env.MODEL = 'test-model';
    process.env.SUPPORTS_VISION = 'true';
    const provider = createProvider({});
    expect(provider.supportsVision).toBe(true);
  });

  it('should default supportsVision to false', () => {
    process.env.BASE_URL = 'https://api.example.com';
    process.env.MODEL = 'test-model';
    delete process.env.SUPPORTS_VISION;
    const provider = createProvider({});
    expect(provider.supportsVision).toBe(false);
  });
});
