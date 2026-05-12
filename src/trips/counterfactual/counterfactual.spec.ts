import { buildPhysicsFieldIndex } from '../physics/build-physics-field-index';
import type { UnifiedPhysicsField } from '../physics/unified-physics-field.types';
import { normalizeUnifiedPhysicsField } from '../physics/physics-field-normalization';
import { buildExecutionProof } from '../execution-trace-compressor/build-execution-proof';
import { generateStandardCounterfactualBranches } from './generate-branches';
import {
  evaluateBaselineBranch,
  evaluateCounterfactualBranches,
} from './evaluate-branches';
import {
  attachCounterfactualToProof,
  selectCounterfactualDecision,
} from './select-counterfactual-decision';

function oneLeg(mobility: number): UnifiedPhysicsField {
  return normalizeUnifiedPhysicsField({
    legId: 'leg-1',
    date: '2026-06-01',
    stateVector: {
      mobility,
      exposure: 0.25,
      energy: 0.75,
      temporalPressure: 0.2,
    },
    constraints: { blocked: false, severity: 'LOW' },
    derived: 'STABLE',
  });
}

describe('counterfactual kernel (P-Next 8)', () => {
  it('runs baseline + branches and attaches audit fields to proof', () => {
    const idx = buildPhysicsFieldIndex([oneLeg(0.7)]);
    const branches = generateStandardCounterfactualBranches('test');
    const baseline = evaluateBaselineBranch(idx, 'test:base');
    const perturbed = evaluateCounterfactualBranches(idx, branches);
    const decision = selectCounterfactualDecision(baseline, perturbed, branches);
    expect(decision.chosenBranchId).toBeDefined();
    expect(decision.regretDistribution.length).toBe(5);
    expect(decision.robustnessScore).toBeGreaterThanOrEqual(0);

    const proof = buildExecutionProof({
      attachSemanticLayer: true,
      physicsFieldIndex: idx,
      executionOverlayFrames: [],
      triggers: [],
      changedSlotIds: [],
    });
    const merged = attachCounterfactualToProof(proof, decision);
    expect(merged.chosenBranchId).toBe(decision.chosenBranchId);
    expect(merged.regretDistribution?.length).toBe(5);
  });
});
