import { createProvider } from './index.js';
import { jest } from '@jest/globals';

describe('createProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('throws error when BASE_URL is not set', () => {
    delete process.env.BASE_URL;
    expect(() => createProvider()).toThrow('BASE_URL is not set in .env');
  });

  test('throws error when MODEL is not set', () => {
    delete process.env.MODEL;
    expect(() => createProvider()).toThrow('MODEL is not set in .env');
  });

  test('creates provider with overrides', () => {
    const provider = createProvider({
      baseURL: 'http://localhost:8080',
      model: 'test-model',
    });
    expect(provider.name).toBe('test-model @ http://localhost:8080');
  });

  // Additional tests for chat method and other functionality can be added here.
});
