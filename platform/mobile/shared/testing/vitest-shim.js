// Runtime shim so files written against the Vitest API (`import ... from 'vitest'`)
// resolve under Jest, which is the runner this project actually uses.
// The Vitest API used across the test suite (fn/mock/spyOn/clearAllMocks/timers)
// is signature-compatible with Jest, so `vi` is simply aliased to `jest`.
module.exports = {
  describe,
  it,
  test: it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi: jest,
};
