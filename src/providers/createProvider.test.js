// src/providers/createProvider.test.js
import { createProvider } from './index.js';
import OpenAI from 'openai';

// Mock OpenAI
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      beta: {
        chat: {
          completions: {
            stream: jest.fn().mockReturnValue(
              // Async iterable that yields chunks
              (async function* () {
                yield { choices: [{ delta: { content: 'Hello' } }] };
              })()
            ),
          },
        },
      },
    })),
  };
});

describe('createProvider', () => {
  test('throws error if baseURL is not set', () => {
    delete process.env.BASE_URL;
    process.env.MODEL = 'test-model';
    expect(() => createProvider()).toThrow('BASE_URL is not set in .env');
  });

  test('throws error if model is not set', () => {
    process.env.BASE_URL = 'http://test.com';
    delete process.env.MODEL;
    expect(() => createProvider()).toThrow('MODEL is not set in .env');
  });

  test('creates provider with overrides', () => {
    const provider = createProvider({ baseURL: 'http://override.com', model: 'override-model' });
    expect(provider.name).toBe('override-model @ http://override.com');
    expect(provider.supportsVision).toBe(false);
  });

  test('truncates tool description to 50 characters', async () => {
    const mockStream = jest.fn();
    OpenAI.mockImplementation(() => ({
      beta: {
        chat: {
          completions: {
            stream: mockStream,
          },
        },
      },
    }));

    const provider = createProvider({ baseURL: 'http://test.com', model: 'test-model' });

    const longDescription = 'A'.repeat(100); // 100 characters
    const tools = [{ name: 'testTool', description: longDescription, parameters: {} }];

    await provider.chat({ messages: [{ role: 'user', content: 'hi' }], tools });

    expect(mockStream).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({
            function: expect.objectContaining({
              description: 'A'.repeat(50), // Truncated to 50
            }),
          }),
        ]),
      })
    );
  });
});
