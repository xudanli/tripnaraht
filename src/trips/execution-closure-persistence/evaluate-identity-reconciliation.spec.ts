import {
  evaluateIdentityReconciliation,
  resolveEcoReconciliationPolicy,
} from './evaluate-identity-reconciliation';
import type { IdentityPathCost } from './identity-trajectory.types';
import type { ResolvedEcoReconciliationPolicy } from './eco-reconciliation.types';

function pc(over: Partial<IdentityPathCost['components']> & Partial<Pick<IdentityPathCost, 'normalizedScore'>>): IdentityPathCost {
  const mutationEnergy = over.mutationEnergy ?? 0;
  const rejectionPressure = over.rejectionPressure ?? 0;
  const stabilityDecay = over.stabilityDecay ?? 0;
  const branchDivergence = over.branchDivergence ?? 0;
  const totalCost =
    mutationEnergy + rejectionPressure + stabilityDecay + branchDivergence;
  return {
    totalCost,
    components: {
      mutationEnergy,
      rejectionPressure,
      stabilityDecay,
      branchDivergence,
    },
    normalizedScore: over.normalizedScore ?? 1 / (1 + Math.max(0, totalCost)),
  };
}

const neutralP: ResolvedEcoReconciliationPolicy = {
  enabled: true,
  rollbackPressureThreshold: 1.1,
  divergeEnergyThreshold: 2.75,
  acceptScoreThreshold: 0.75,
  softAlignScoreLower: 0.5,
  rejectionPressureLowMax: 0.35,
};

describe('evaluateIdentityReconciliation', () => {
  it('classifies ROLLBACK_BRANCH when stability + rejection pressure exceed threshold', () => {
    const d = evaluateIdentityReconciliation(
      pc({ stabilityDecay: 0.9, rejectionPressure: 0.25 }),
      [],
      neutralP,
    );
    expect(d.type).toBe('ROLLBACK_BRANCH');
  });

  it('classifies HARD_DIVERGE when mutation + rejection energy exceed threshold', () => {
    const d = evaluateIdentityReconciliation(
      pc({ mutationEnergy: 2.5, rejectionPressure: 0.5, stabilityDecay: 0 }),
      [],
      neutralP,
    );
    expect(d.type).toBe('HARD_DIVERGE');
  });

  it('classifies ACCEPT when score is high and rejection pressure is low', () => {
    const d = evaluateIdentityReconciliation(
      {
        totalCost: 0.1,
        components: {
          mutationEnergy: 0.05,
          rejectionPressure: 0.05,
          stabilityDecay: 0,
          branchDivergence: 0,
        },
        normalizedScore: 0.92,
      },
      [],
      neutralP,
    );
    expect(d.type).toBe('ACCEPT');
  });

  it('classifies SOFT_ALIGN in the mid score band', () => {
    const d = evaluateIdentityReconciliation(
      {
        totalCost: 1.2,
        components: {
          mutationEnergy: 0.2,
          rejectionPressure: 0.2,
          stabilityDecay: 0.4,
          branchDivergence: 0.4,
        },
        normalizedScore: 0.62,
      },
      [],
      neutralP,
    );
    expect(d.type).toBe('SOFT_ALIGN');
  });

  it('resolveEcoReconciliationPolicy respects explicit enabled: false over env', () => {
    process.env.TRIP_IDENTITY_RECONCILIATION_ENABLE = '1';
    const r = resolveEcoReconciliationPolicy({
      reconciliation: { enabled: false },
    } as import('../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types').EcoClosurePolicy);
    expect(r.enabled).toBe(false);
    delete process.env.TRIP_IDENTITY_RECONCILIATION_ENABLE;
  });
});
