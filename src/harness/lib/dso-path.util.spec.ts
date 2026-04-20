import { getAtPath } from './dso-path.util';

describe('getAtPath', () => {
  it('reads nested paths', () => {
    const root = { a: { b: { c: 1 } } };
    expect(getAtPath(root, 'a.b.c')).toBe(1);
  });

  it('returns undefined for missing segments', () => {
    expect(getAtPath({ a: {} }, 'a.b.c')).toBeUndefined();
  });
});
