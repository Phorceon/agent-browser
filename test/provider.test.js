import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createProvider } from '../src/providers/index.js';

describe('createProvider', () => {
  it('should create a provider with overrides', () => {
    const provider = createProvider({
      baseURL: 'http://example.com',
      model: 'test-model',
      apiKey: 'test-key',
    });
    assert(provider.name.includes('test-model'));
  });

  it('should throw error without baseURL', () => {
    assert.throws(() => createProvider({}), /BASE_URL is not set/);
  });
});