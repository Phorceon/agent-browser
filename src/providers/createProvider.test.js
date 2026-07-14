import { createProvider } from './index.js';

describe('createProvider', () => {
  test('throws error if baseURL is not provided', () => {
    const originalEnv = process.env.BASE_URL;
    delete process.env.BASE_URL;
    expect(() => createProvider()).toThrow('BASE_URL is not set in .env');
    process.env.BASE_URL = originalEnv;
  });
});