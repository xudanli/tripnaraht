import { djb2Fingerprint } from './djb2-fingerprint.runner';

describe('djb2-fingerprint.runner', () => {
  it('is stable across key order', () => {
    expect(djb2Fingerprint({ a: 1, b: 2 })).toBe(djb2Fingerprint({ b: 2, a: 1 }));
  });
});
