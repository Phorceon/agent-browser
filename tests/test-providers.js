const providerA = require('./provider-a');
const providerB = require('./provider-b');

const providers = [
  { name: 'Provider A', module: providerA },
  { name: 'Provider B', module: providerB },
];

describe('Providers', () => {
  providers.forEach(({ name, module }) => {
    it(`should work for ${name}`, () => {
      const result = module.doSomething();
      expect(result).toBe(true);
    });
  });
});