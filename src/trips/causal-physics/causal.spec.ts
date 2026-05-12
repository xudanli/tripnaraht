import { buildPhysicsFieldIndex } from '../physics/build-physics-field-index';
import type { UnifiedPhysicsField } from '../physics/unified-physics-field.types';
import { normalizeUnifiedPhysicsField } from '../physics/physics-field-normalization';
import { projectPhysicsIndexToCausalGraph } from './project-physics-to-causal-graph';
import { planCausalInterventions, attachCausalPlanningToProof } from './causal-planner';
import { correctCausalWeights } from './causal-feedback';
import { evaluateCausalUtility } from './intervention-engine';
import { buildExecutionProof } from '../execution-trace-compressor/build-execution-proof';

function leg(id: string, m: number): UnifiedPhysicsField {
  return normalizeUnifiedPhysicsField({
    legId: id,
    date: '2026-06-01',
    stateVector: {
      mobility: m,
      exposure: 0.4,
      energy: 0.65,
      temporalPressure: 0.35,
    },
    constraints: { blocked: false, severity: 'LOW' },
    derived: 'STABLE',
  });
}

describe('causal-physics (P-Next 9)', () => {
  it('projects index → graph → plans interventions → attaches proof', () => {
    const idx = buildPhysicsFieldIndex([leg('a', 0.55), leg('b', 0.6)]);
    const cg = projectPhysicsIndexToCausalGraph(idx);
    expect(cg.nodes).toHaveLength(4);

    const plan = planCausalInterventions(cg);
    expect(plan.bestInterventions.length).toBeGreaterThan(0);
    expect(plan.utilityScore).toBeGreaterThanOrEqual(0);

    const proof = buildExecutionProof({
      attachSemanticLayer: true,
      physicsFieldIndex: idx,
      executionOverlayFrames: [],
      triggers: [],
      changedSlotIds: [],
    });
    const merged = attachCausalPlanningToProof(proof, cg, plan);
    expect(merged.interventionSet?.length).toBeGreaterThan(0);
    expect(merged.causalGraphBefore?.nodes.length).toBe(4);
    expect(merged.utilityScore).toBe(plan.utilityScore);
  });

  it('feedback correction adjusts edge weights deterministically', () => {
    const idx = buildPhysicsFieldIndex([leg('x', 0.5)]);
    const g = projectPhysicsIndexToCausalGraph(idx);
    const u0 = evaluateCausalUtility(g);
    const g2 = correctCausalWeights({
      graph: g,
      predictedUtility: u0 + 0.2,
      observedUtility: u0,
    });
    expect(g2.edges.some((e, i) => e.weight !== g.edges[i]?.weight)).toBe(true);
  });
});
