import type { CausalFieldSnapshot, CausalInteractionKernel } from '../contracts/multi-agent-causal-field.types';
import {
  beliefEntropy,
  beliefRevisionTowardWorld,
  classifyEcusEpistemicTier,
  ecusUniverseState,
  epistemicallyCausalAdmissible,
  normalizeBeliefs,
  triadicReplayConsistency,
} from './ecus-synthesis.util';
import { causalWorldFrom } from './mcut-modal-universe.util';

const K: CausalInteractionKernel = {
  agentOrder: ['aggregate_intensity', 'aggregate_entropy'],
  matrix: [
    [0, 0.25],
    [0.25, 0],
  ],
};

function phi(a: number, b: number): CausalFieldSnapshot {
  return {
    queryId: 'q',
    timeStep: 0,
    particles: [
      { agentId: 'aggregate_intensity', phi: a },
      { agentId: 'aggregate_entropy', phi: b },
    ],
  };
}

describe('ecus-synthesis.util', () => {
  it('normalizeBeliefs sums to 1', () => {
    const n = normalizeBeliefs({ masses: { w1: 2, w2: 2 } });
    expect(n.masses.w1).toBeCloseTo(0.5);
    expect(n.masses.w2).toBeCloseTo(0.5);
  });

  it('epistemicallyCausalAdmissible requires belief and accessibility', () => {
    const anchor = causalWorldFrom('a', phi(0.5, 0.5), K);
    const target = causalWorldFrom('t', phi(0.51, 0.49), K);
    const ok = epistemicallyCausalAdmissible({ masses: { t: 1 } }, target, anchor);
    expect(ok.admissible).toBe(true);
    const bad = epistemicallyCausalAdmissible({ masses: { other: 1 } }, target, anchor);
    expect(bad.admissible).toBe(false);
  });

  it('triadicReplayConsistency agrees when exec≈shadow 𝒰', () => {
    const b = { masses: { w_exec: 0.6, w_shadow: 0.4 } };
    const u = ecusUniverseState(b, K);
    const anchor = causalWorldFrom('anchor', phi(0.5, 0.5), K);
    const we = causalWorldFrom('w_exec', phi(0.55, 0.45), K);
    const ws = causalWorldFrom('w_shadow', phi(0.54, 0.46), K);
    const w = triadicReplayConsistency(u, u, anchor, we, ws, {
      beliefL1Tol: 1,
      reachabilityScoreTol: 1,
    });
    expect(w.triadicallyConsistent).toBe(true);
  });

  it('beliefRevisionTowardWorld concentrates mass', () => {
    const r = beliefRevisionTowardWorld({ masses: { a: 0.5, b: 0.5 } }, 'a', 0.5);
    expect(r.masses.a ?? 0).toBeGreaterThan(0.5);
  });

  it('classifyEcusEpistemicTier uses witness + entropy', () => {
    const witness = {
      schema: 'ecus/triadic-witness/v1' as const,
      beliefL1Distance: 0,
      kernelAligned: true,
      modalReachabilityAligned: true,
      triadicallyConsistent: true,
    };
    expect(classifyEcusEpistemicTier(witness, 0.5)).toBe('EPISTEMIC_LOCAL');
  });

  it('beliefEntropy is zero for point mass', () => {
    expect(beliefEntropy({ masses: { only: 1 } })).toBe(0);
  });
});
