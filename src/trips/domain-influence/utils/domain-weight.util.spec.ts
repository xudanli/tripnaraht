import {
  computeDomainWeights,
  findGlobalLowInfluenceMembers,
  normalizeOverrideWeights,
} from './domain-weight.util';

describe('domain-weight.util', () => {
  it('assigns 100% to sole claimer', () => {
    const { weights, source } = computeDomainWeights(
      [{ userId: 'u1', selfScore: 80, endorsementCount: 2 }],
      undefined,
      5,
    );
    expect(source).toBe('computed');
    expect(weights).toHaveLength(1);
    expect(weights[0].weight).toBe(1);
    expect(weights[0].isLeader).toBe(true);
  });

  it('splits equally among multiple claimers', () => {
    const { weights } = computeDomainWeights(
      [
        { userId: 'u1', selfScore: 70, endorsementCount: 1 },
        { userId: 'u2', selfScore: 90, endorsementCount: 3 },
      ],
      undefined,
      4,
    );
    expect(weights).toHaveLength(2);
    expect(weights[0].weight).toBeCloseTo(0.5);
    expect(weights[1].weight).toBeCloseTo(0.5);
    expect(weights.every((w) => !w.isLeader)).toBe(true);
  });

  it('uses negotiation overrides when provided', () => {
    const { weights, source } = computeDomainWeights(
      [
        { userId: 'u1', selfScore: 70, endorsementCount: 1 },
        { userId: 'u2', selfScore: 90, endorsementCount: 3 },
      ],
      [
        { userId: 'u1', weight: 0.2 },
        { userId: 'u2', weight: 0.8 },
      ],
      4,
    );
    expect(source).toBe('negotiation');
    expect(weights.find((w) => w.userId === 'u2')?.weight).toBeCloseTo(0.8);
  });

  it('normalizes override weights to sum 1', () => {
    const normalized = normalizeOverrideWeights([
      { userId: 'a', weight: 1 },
      { userId: 'b', weight: 3 },
    ]);
    const sum = normalized.reduce((acc, o) => acc + o.weight, 0);
    expect(sum).toBeCloseTo(1);
    expect(normalized.find((o) => o.userId === 'b')?.weight).toBeCloseTo(0.75);
  });

  it('flags member who is lowest in all participated domains', () => {
    const byDomain = new Map<string, Map<string, number>>([
      ['accommodation', new Map([['u1', 0.2], ['u2', 0.8]])],
      ['dining', new Map([['u1', 0.3], ['u3', 0.7]])],
    ]);
    expect(findGlobalLowInfluenceMembers(['u1', 'u2', 'u3'], byDomain)).toEqual(['u1']);
  });
});
