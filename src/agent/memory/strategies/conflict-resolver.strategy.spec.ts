import { ConflictResolverStrategy, applyHalfLifeDecay } from './conflict-resolver.strategy';

describe('ConflictResolverStrategy', () => {
  it('half-life decay should reduce confidence over time', () => {
    expect(applyHalfLifeDecay(1, 0, 10)).toBeCloseTo(1);
    // after one half-life, confidence halves
    expect(applyHalfLifeDecay(1, 10, 10)).toBeCloseTo(0.5);
    // after two half-lives, quarter
    expect(applyHalfLifeDecay(1, 20, 10)).toBeCloseTo(0.25);
  });

  it('session wins on conflict and records contradictionScore', () => {
    const s = new ConflictResolverStrategy();
    const out = s.resolve({
      now: new Date('2026-01-01T00:00:00Z'),
      session: { scope: 'SESSION', value: 'SLOW', confidence: 0.6, updatedAt: '2026-01-01T00:00:00Z' },
      longTerm: {
        scope: 'LONG_TERM',
        value: 'FAST',
        confidence: 0.9,
        updatedAt: '2023-01-01T00:00:00Z',
        halfLifeDays: 365,
      },
    });
    expect(out?.winner.scope).toBe('SESSION');
    expect(out?.contradictionScore).toBeGreaterThan(0);
    expect(out?.factors.longTermDecayedConfidence).toBeDefined();
  });

  it('no contradiction when values equal', () => {
    const s = new ConflictResolverStrategy();
    const out = s.resolve({
      session: { scope: 'SESSION', value: 'RELAXED', confidence: 0.4, updatedAt: '2026-01-01T00:00:00Z' },
      longTerm: { scope: 'LONG_TERM', value: 'RELAXED', confidence: 0.8, updatedAt: '2024-01-01T00:00:00Z' },
    });
    expect(out?.contradictionScore).toBe(0);
  });
});

