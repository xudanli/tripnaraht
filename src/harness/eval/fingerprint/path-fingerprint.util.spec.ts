import { computePathFingerprint, omitPaths } from './path-fingerprint.util';

describe('path-fingerprint.util', () => {
  it('omitPaths strips noisy fields before hash', () => {
    const a = { id: '1', ts: 't1', nested: { requestId: 'r1', ok: true } };
    const b = { id: '1', ts: 't2', nested: { requestId: 'r2', ok: true } };
    const fpA = computePathFingerprint(a, ['ts', 'nested.requestId']);
    const fpB = computePathFingerprint(b, ['ts', 'nested.requestId']);
    expect(fpA).toBe(fpB);
  });

  it('omitPaths is deterministic', () => {
    expect(omitPaths({ z: 1, a: 2 }, [])).toEqual({ a: 2, z: 1 });
  });
});
