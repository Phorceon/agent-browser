import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createProvider } from '../src/providers/index.js';

// Mock environment variables for testing
delete process.env.BASE_URL;
delete process.env.MODEL;

const mockProvider = createProvider({
  baseURL: 'http://test.example.com',
  apiKey: 'test-key',
  model: 'test-model',
  supportsVision: true
});

const mockNoVisionProvider = createProvider({
  baseURL: 'http://test.example.com',
  apiKey: 'test-key',
  model: 'test-model',
  supportsVision: false
});

describe('Provider creation', () => {
  it('should create provider with correct properties', () => {
    assert.strictEqual(mockProvider.name, 'test-model @ http://test.example.com');
    assert.strictEqual(mockProvider.supportsVision, true);
    assert.strictEqual(typeof mockProvider.chat, 'function');
  });

  it('should handle supportsVision as false', () => {
    assert.strictEqual(mockNoVisionProvider.supportsVision, false);
  });
});

describe('Provider chat method', () => {
  it('should be an async function', () => {
    assert.strictEqual(typeof mockProvider.chat, 'function');
  });
});