const { expect } = require('chai');
const { getProvider } = require('../provider');

describe('Provider', function() {
  it('should return a provider instance when called with valid arguments', function() {
    const provider = getProvider({ id: 'test' });
    expect(provider).to.be.an('object');
    expect(provider.id).to.equal('test');
  });

  it('should throw an error when called without required arguments', function() {
    expect(() => getProvider()).to.throw('Invalid arguments');
  });
});