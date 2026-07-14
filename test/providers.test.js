import assert from 'assert';
import { createProvider } from '../src/providers/index.js';

// Test that createProvider throws when required parameters are missing
assert.throws(() => createProvider(), /BASE_URL is not set|MODEL is not set/);

// Test that createProvider returns a valid provider object with overrides
const provider = createProvider({ baseURL: 'http://test', model: 'test-model', apiKey: 'test' });
assert.ok(provider.name.includes('test-model'));
assert.ok(provider.name.includes('http://test'));
assert.strictEqual(typeof provider.chat, 'function');
assert.strictEqual(provider.supportsVision, false);