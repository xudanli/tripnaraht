import type { ExecutionPhysicsModel } from '../execution-physics/execution-physics.types';
import {
  collapseReality,
  explainRealityCollapse,
  generateRealityCandidates,
  realityCollapseScore,
  type MetaRealityKernel,
  type RealitySeed,
} from './index';

function basePhysics(): ExecutionPhysicsModel {
  return {
    version: '20',
    timeModel: { type: 'LINEAR_TIME', driftBehavior: 'ACCUMULATIVE' },
    causalityModel: 'DAG_CAUSALITY',
    stateTransitionModel: { defaultCollapse: 'EAGER' },
    constraints: 'STRICT_SEQUENTIAL',
  };
}

describe('meta-reality (P21)', () => {
  it('generateRealityCandidates expands each kernel seed into three mutations', () => {
    const kernel: MetaRealityKernel = {
      realitySeeds: [
        {
          seedId: 'seed_a',
          timePhysics: { type: 'LINEAR_TIME', driftBehavior: 'ACCUMULATIVE' },
          causalityPhysics: 'DAG_CAUSALITY',
          executionSemantics: basePhysics(),
          probabilityWeight: 1,
        },
      ],
      bootstrapRules: [],
      selectionPhysics: {
        entropyBias: 0.1,
        stabilityWeight: 0.5,
        utilityWeight: 0.5,
        collapseMode: 'DETERMINISTIC',
      },
      stabilityConstraints: [],
    };

    const cands = generateRealityCandidates(kernel);
    expect(cands).toHaveLength(3);
    const sum = cands.reduce((a, s) => a + s.probabilityWeight, 0);
    expect(sum).toBeCloseTo(1);
  });

  it('collapseReality picks highest collapse score', () => {
    const seeds: RealitySeed[] = [
      {
        seedId: 'low',
        timePhysics: { type: 'LINEAR_TIME', driftBehavior: 'ACCUMULATIVE' },
        causalityPhysics: 'DAG_CAUSALITY',
        executionSemantics: basePhysics(),
        probabilityWeight: 0.5,
        stabilityScore: 0.2,
        executionUtility: 0.3,
        driftPenalty: 0.4,
      },
      {
        seedId: 'high',
        timePhysics: { type: 'CAUSAL_TIME', driftBehavior: 'CONTEXTUAL_REBASE' },
        causalityPhysics: 'DAG_CAUSALITY',
        executionSemantics: basePhysics(),
        probabilityWeight: 0.5,
        stabilityScore: 0.95,
        executionUtility: 0.9,
        driftPenalty: 0.05,
      },
    ];

    const physics = {
      entropyBias: 0.05,
      stabilityWeight: 1,
      utilityWeight: 1,
      collapseMode: 'DETERMINISTIC' as const,
    };

    const pick = collapseReality(seeds, physics);
    expect(pick.seedId).toBe('high');
    expect(realityCollapseScore(pick, physics)).toBeGreaterThan(realityCollapseScore(seeds[0]!, physics));
  });

  it('explainRealityCollapse lists winner rationale', () => {
    const seeds: RealitySeed[] = [
      {
        seedId: 'only',
        timePhysics: { type: 'LINEAR_TIME', driftBehavior: 'ACCUMULATIVE' },
        causalityPhysics: 'DAG_CAUSALITY',
        executionSemantics: basePhysics(),
        probabilityWeight: 1,
      },
    ];
    const physics = {
      entropyBias: 0.1,
      stabilityWeight: 0.6,
      utilityWeight: 0.4,
      collapseMode: 'DETERMINISTIC' as const,
    };
    const pick = collapseReality(seeds, physics);
    const lines = explainRealityCollapse(pick, seeds, physics);
    expect(lines.some(l => l.includes('Collapsed to'))).toBe(true);
  });
});
