import { orderPackagesForSession } from './latin-square-order.util';

describe('orderPackagesForSession', () => {
  const ids = ['full_report', 'auto_repair', 'expert_review', 'trip_assurance'];

  it('is stable for the same session seed', () => {
    const a = orderPackagesForSession(ids, 'session-abc', 'LATIN_SQUARE');
    const b = orderPackagesForSession(ids, 'session-abc', 'LATIN_SQUARE');
    expect(a).toEqual(b);
  });

  it('rotates order based on session id', () => {
    const a = orderPackagesForSession(ids, 'session-a', 'LATIN_SQUARE');
    const b = orderPackagesForSession(ids, 'session-b', 'LATIN_SQUARE');
    expect(a).toHaveLength(4);
    expect(new Set(a)).toEqual(new Set(ids));
    // different seeds usually produce different orders
    expect(a.join()).not.toEqual(ids.join());
  });

  it('random mode permutes all packages', () => {
    const r = orderPackagesForSession(ids, 'seed-1', 'RANDOM');
    expect(new Set(r)).toEqual(new Set(ids));
  });
});
