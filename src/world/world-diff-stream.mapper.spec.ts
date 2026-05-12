import {
  toWorldDiffStreamEvent,
  worldDiffContractToStreamEvent,
} from './world-diff-stream.mapper';

describe('toWorldDiffStreamEvent', () => {
  it('maps ROAD domain to ROAD_BLOCK and severity band to numeric', () => {
    const w = toWorldDiffStreamEvent(
      {
        affectedSlots: ['s1'],
        affectedPOIs: [],
        severity: 'HIGH',
        domains: ['ROAD'],
        hasImpact: true,
      },
      {
        explanation: 'F208 closed',
        source: 'USER',
        id: 'fixed-id',
        emittedAtMs: 42,
      },
    );
    expect(w.type).toBe('ROAD_BLOCK');
    expect(w.severity).toBe(85);
    expect(w.affectedSlots).toEqual(['s1']);
    expect(w.source).toBe('USER');
    expect(w.id).toBe('fixed-id');
    expect(w.emittedAtMs).toBe(42);
  });

  it('classifies driving soft cap as DRIVING_POLICY', () => {
    const w = toWorldDiffStreamEvent(
      {
        affectedSlots: ['a', 'b'],
        affectedPOIs: [],
        severity: 'MEDIUM',
        domains: ['BOOKING'],
        hasImpact: true,
      },
      {
        explanation: 'Less mountain driving',
        source: 'USER',
        constraintField: {
          id: 'USER_POLICY_DRIVING',
          type: 'BOOKING',
          state: 'OPEN',
          severity: 40,
          temporalScope: { start: '2026-01-01', end: '2026-01-01' },
          impactWeight: 0.5,
          version: 1,
          userPolicy: { kind: 'DRIVING_SOFT_CAP', maxMountainRoadRatio: 0.2 },
        },
      },
    );
    expect(w.type).toBe('DRIVING_POLICY');
  });
});

describe('worldDiffContractToStreamEvent', () => {
  it('maps GRAPH origin to PROPAGATION stream source', () => {
    const e = worldDiffContractToStreamEvent(
      {
        id: 'x',
        domain: 'ROAD',
        type: 'STATE_CHANGE',
        entityId: 'F208',
        stateBefore: 'OPEN',
        stateAfter: 'CLOSED',
        severity: 'HIGH',
        temporalScope: { start: 'a', end: 'b' },
        impactedSlots: ['s1'],
        propagationHint: 'SEQUENCE',
        source: 'GRAPH',
      },
      'storm closure',
      99,
    );
    expect(e.source).toBe('PROPAGATION');
    expect(e.explanation).toBe('storm closure');
    expect(e.emittedAtMs).toBe(99);
  });
});
