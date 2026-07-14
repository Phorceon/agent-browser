import { createProvider } from '../src/providers/index.js';
import assert from 'node:assert/strict';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('Running provider tests...');

// Override env so createProvider doesn't throw
test('createProvider throws when BASE_URL is missing', () => {
  const saved = process.env.BASE_URL;
  delete process.env.BASE_URL;
  assert.throws(() => createProvider(), /BASE_URL is not set/);
  if (saved) process.env.BASE_URL = saved;
});

test('createProvider throws when MODEL is missing', () => {
  const savedUrl = process.env.BASE_URL;
  const savedModel = process.env.MODEL;
  process.env.BASE_URL = 'http://localhost:8080';
  delete process.env.MODEL;
  assert.throws(() => createProvider(), /MODEL is not set/);
  if (savedUrl) process.env.BASE_URL = savedUrl; else delete process.env.BASE_URL;
  if (savedModel) process.env.MODEL = savedModel;
});

test('createProvider returns a provider object with expected shape', () => {
  const provider = createProvider({
    baseURL: 'http://localhost:8080',
    apiKey: 'test-key',
    model: 'test-model',
    supportsVision: false,
  });
  assert.equal(typeof provider.name, 'string');
  assert.equal(provider.supportsVision, false);
  assert.equal(typeof provider.chat, 'function');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
console.log('All tests passed!');
