import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createProvider } from './index.js';

describe('createProvider', () => {
  it('should throw an error when BASE_URL is not set', () => {
    const originalBaseUrl = process.env.BASE_URL;
    const originalModel = process.env.MODEL;

    delete process.env.BASE_URL;
    delete process.env.MODEL;

    try {
      assert.throws(() => createProvider(), /BASE_URL is not set/);
    } finally {
      if (originalBaseUrl !== undefined) process.env.BASE_URL = originalBaseUrl;
      if (originalModel !== undefined) process.env.MODEL = originalModel;
    }
  });

  it('should throw an error when MODEL is not set', () => {
    const originalBaseUrl = process.env.BASE_URL;
    const originalModel = process.env.MODEL;

    process.env.BASE_URL = 'http://example.com';
    delete process.env.MODEL;

    try {
      assert.throws(() => createProvider(), /MODEL is not set/);
    } finally {
      if (originalBaseUrl !== undefined) process.env.BASE_URL = originalBaseUrl;
      else delete process.env.BASE_URL;
      if (originalModel !== undefined) process.env.MODEL = originalModel;
    }
  });

  it('should return a provider object with correct name', () => {
    const originalBaseUrl = process.env.BASE_URL;
    const originalModel = process.env.MODEL;

    process.env.BASE_URL = 'http://test.com';
    process.env.MODEL = 'test-model';

    try {
      const provider = createProvider();
      assert.strictEqual(provider.name, 'test-model @ http://test.com');
    } finally {
      if (originalBaseUrl !== undefined) process.env.BASE_URL = originalBaseUrl;
      else delete process.env.BASE_URL;
      if (originalModel !== undefined) process.env.MODEL = originalModel;
    }
  });
});