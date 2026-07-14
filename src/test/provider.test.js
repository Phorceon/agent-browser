const Provider = require('../provider');

describe('Provider', () => {
  let provider;

  beforeEach(() => {
    provider = new Provider();
  });

  it('should connect', async () => {
    await provider.connect();
  });

  it('should fetch data', async () => {
    const data = await provider.fetchData();
    expect(data).toBeDefined();
  });
});