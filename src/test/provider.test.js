import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createProvider } from '../providers/index.js';

describe('createProvider', () => {
  it('should throw if baseURL is not provided', () => {
    assert.throws(() => createProvider({ model: 'test' }), /BASE_URL is not set/);
  });

  it('should throw if model is not provided', () => {
    assert.throws(() => createProvider({ baseURL: 'http://test' }), /MODEL is not set/);
  });

  it('should return a provider object with valid inputs', () => {
    const provider = createProvider({ baseURL: 'http://test', model: 'test-model' });
    assert.equal(provider.name, 'test-model @ http://test');
    assert.equal(typeof provider.chat, 'function');
  });
});
