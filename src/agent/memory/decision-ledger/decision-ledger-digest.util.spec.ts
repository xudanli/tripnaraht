import { stableDigest } from './decision-ledger-digest.util';

describe('stableDigest', () => {
  it('is invariant to object key insertion order at nested levels', () => {
    const a = { z: 1, m: { b: 2, a: 3 } };
    const b = { m: { a: 3, b: 2 }, z: 1 };
    expect(stableDigest(a)).toBe(stableDigest(b));
  });
});
