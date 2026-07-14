const { expect } = require('chai'); // Assuming Chai for assertions

function someFunction(input) {
  if (input === null || input === undefined) {
    throw new Error('Input cannot be null or undefined');
  }
  return input * 2;
}

describe('someFunction', () => {
  it('should return double the input for valid numbers', () => {
    expect(someFunction(5)).to.equal(10);
  });

  // Added missing guard: test for null input to ensure error is thrown
  it('should throw an error for null input', () => {
    expect(() => someFunction(null)).to.throw('Input cannot be null or undefined');
  });

  it('should throw an error for undefined input', () => {
    expect(() => someFunction(undefined)).to.throw('Input cannot be null or undefined');
  });
});