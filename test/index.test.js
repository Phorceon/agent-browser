import { createProvider } from '../src/providers/index.js';
import assert from 'assert';

// Test 1: createProvider without overrides should throw if env vars not set
const originalBaseUrl = process.env.BASE_URL;
const originalModel = process.env.MODEL;

// Clear env vars to simulate missing
delete process.env.BASE_URL;
delete process.env.MODEL;

try {
  createProvider();
  assert.fail('Should throw when BASE_URL is not set');
} catch (e) {
  assert.ok(e.message.includes('BASE_URL is not set'), 'Error should mention BASE_URL, got: ' + e.message);
}

try {
  createProvider({ baseURL: 'http://example.com' }); // Only baseURL, no model
  assert.fail('Should throw when MODEL is not set');
} catch (e) {
  assert.ok(e.message.includes('MODEL is not set'), 'Error should mention MODEL, got: ' + e.message);
}

// Test 2: createProvider with overrides should not throw
try {
  const provider = createProvider({ baseURL: 'http://example.com', model: 'test-model' });
  assert.ok(provider, 'Should return a provider object');
  assert.equal(provider.name, 'test-model @ http://example.com', 'Provider name should match');
} catch (e) {
  assert.fail('Should not throw with valid overrides, got: ' + e.message);
}

// Restore env vars
process.env.BASE_URL = originalBaseUrl;
process.env.MODEL = originalModel;

console.log('All tests passed!');