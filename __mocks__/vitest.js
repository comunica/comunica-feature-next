// Vitest compatibility shim for Jest.
// @traqula/test-utils uses vitest's `expect`, `it`, and `describe`.
// This mock maps them to Jest's globals so tests run under Jest.

const jestExpect = globalThis.expect;

// Wrap jest's `it` to pass a vitest-like context `{ expect }` to the callback.
function it(name, fn, timeout) {
  return globalThis.it(name, async() => {
    await fn({ expect: jestExpect });
  }, timeout);
}
it.each = globalThis.it.each;
it.skip = globalThis.it.skip;
it.only = globalThis.it.only;
it.todo = globalThis.it.todo;

module.exports = {
  expect: jestExpect,
  it,
  describe: globalThis.describe,
  beforeEach: globalThis.beforeEach,
  afterEach: globalThis.afterEach,
  beforeAll: globalThis.beforeAll,
  afterAll: globalThis.afterAll,
  vi: {
    fn: () => jest.fn(),
    spyOn: jest.spyOn,
    mock: jest.mock,
  },
};
