import { getDOMSnapshot } from '../src/tools.js';

// Helper to create a mock page object for tests
function createMockPage(html = '<html><body><button>Click me</button></body></html>') {
  return {
    evaluate: async (fn) => {
      // Simulate a minimal browser environment for the function
      const document = { body: { innerText: html } };
      const window = { innerHeight: 800, innerWidth: 1200 };
      return fn({ document, window, location: { href: 'http://test.com' }, title: 'Test Page' });
    },
  };
}

describe('getDOMSnapshot', () => {
  // Improved test: clear description and mocked page setup
  test('should return a snapshot with headings, links, buttons, and text blocks', async () => {
    const page = createMockPage();
    const snapshot = await getDOMSnapshot(page);
    expect(snapshot).toHaveProperty('url');
    expect(snapshot).toHaveProperty('title');
    expect(snapshot).toHaveProperty('headings');
    expect(snapshot).toHaveProperty('links');
    expect(snapshot).toHaveProperty('buttons');
    expect(snapshot).toHaveProperty('textBlocks');
    expect(Array.isArray(snapshot.headings)).toBe(true);
  });

  // Added missing guard: test with null page to ensure error handling
  test('should throw an error if page is null', async () => {
    await expect(getDOMSnapshot(null)).rejects.toThrow();
  });

  // Reduced duplication: reuse helper for empty page case
  test('should handle empty page gracefully by returning minimal data', async () => {
    const page = createMockPage('');
    const snapshot = await getDOMSnapshot(page);
    expect(snapshot.textBlocks).toBe('');
    expect(snapshot.headings).toHaveLength(0);
  });
});