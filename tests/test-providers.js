import assert from 'assert';
import { createProvider } from '../src/providers/index.js';

// Set dummy environment variables for testing
process.env.BASE_URL = 'http://dummy-url';
process.env.MODEL = 'dummy-model';

// Test that createProvider returns an object with expected properties
const provider = createProvider();
assert(provider.name, 'Provider should have a name');
assert(typeof provider.chat === 'function', 'Provider should have a chat function');
console.log('All tests passed!');
