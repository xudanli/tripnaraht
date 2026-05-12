import { buildPhysicsFieldIndex } from '../physics/build-physics-field-index';
import type { UnifiedPhysicsField } from '../physics/unified-physics-field.types';
import { normalizeUnifiedPhysicsField } from '../physics/physics-field-normalization';
import { projectPhysicsIndexToCausalGraph } from '../causal-physics/project-physics-to-causal-graph';
import { graphToCausalModel } from './causal-model-rewriter';
import { runReflectiveSelfUpdate, attachReflectiveCausalToProof } from './self-update-loop';
import { selectBestCausalModel } from '../causal-consensus/causal-model-consensus';
import { buildExecutionProof } from '../execution-trace-compressor/build-execution-proof';

function leg(id: string): UnifiedPhysicsField {
  return normalizeUnifiedPhysicsField({
    legId: id,
    date: '2026-06-01',
    stateVector: {
      mobility: 0.55,
      exposure: 0.35,
      energy: 0.7,
      temporalPressure: 0.3,
    },
    constraints: { blocked: false, severity: 'LOW' },
    derived: 'STABLE',
  });
}

describe('causal-reflection (P-Next 10)', () => {
  it('self-update revises weights and attaches reflective proof fields', () => {
    const idx = buildPhysicsFieldIndex([leg('a')]);
    const cg = projectPhysicsIndexToCausalGraph(idx);
    const before = graphToCausalModel(cg, {
      confidence: 0.9,
      origin: 'OBSERVED',
      revisionEpoch: 0,
    });

    const out = runReflectiveSelfUpdate(before, {
      predictedUtility: 0.85,
      observedUtility: 0.45,
    });

    expect(out.modelAfter.meta.revisionEpoch).toBeGreaterThanOrEqual(before.meta.revisionEpoch ?? 0);
    expect(out.driftScore).toBeGreaterThan(0);
    expect(out.stabilityScore).toBeLessThanOrEqual(1);

    const proof = buildExecutionProof({
      physicsFieldIndex: idx,
      executionOverlayFrames: [],
      triggers: [],
      changedSlotIds: [],
    });
    const merged = attachReflectiveCausalToProof(
      proof,
      before,
      out.modelAfter,
      out.patchesApplied,
      out.driftScore,
      out.stabilityScore,
    );
    expect(merged.causalModelAfter?.meta.confidence).toBeDefined();
    expect(merged.modelRevisions?.length).toBeGreaterThan(0);
  });

  it('consensus picks lowest model error', () => {
    const idx = buildPhysicsFieldIndex([leg('x')]);
    const cg = projectPhysicsIndexToCausalGraph(idx);
    const m = graphToCausalModel(cg, { confidence: 0.8, origin: 'INFERRED' });
    const best = selectBestCausalModel([
      { replicaId: 'a', model: m, modelError: 0.4 },
      { replicaId: 'b', model: m, modelError: 0.1 },
    ]);
    expect(best.replicaId).toBe('b');
  });
});
