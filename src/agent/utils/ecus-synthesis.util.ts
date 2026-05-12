/**
 * ECUS — ⟨𝔅, K, R⟩ updates, admissibility, triadic replay consistency.
 */

import type { CausalInteractionKernel } from '../contracts/multi-agent-causal-field.types';
import type {
  EcusTriadicConsistencyWitness,
  EcusUniverseState,
  EcusEpistemicTier,
  EpistemicMassDistribution,
} from '../contracts/ecus.types';
import {
  ECUS_SCHEMA,
  ECUS_TRIADIC_WITNESS_SCHEMA,
} from '../contracts/ecus.types';
import type { CausalWorld } from '../contracts/mcut.types';
import { evaluateAccessibility } from './mcut-modal-universe.util';
import { fingerprintCausalKernel } from './pccs-ei-certificate.util';

export function normalizeBeliefs(b: EpistemicMassDistribution): EpistemicMassDistribution {
  let sum = 0;
  for (const v of Object.values(b.masses)) {
    sum += Math.max(0, v);
  }
  if (sum <= 0) return { masses: {} };
  const masses: Record<string, number> = {};
  for (const [k, v] of Object.entries(b.masses)) {
    masses[k] = Math.max(0, v) / sum;
  }
  return { masses };
}

export function beliefMass(b: EpistemicMassDistribution, worldId: string): number {
  return b.masses[worldId] ?? 0;
}

export function beliefL1Distance(a: EpistemicMassDistribution, b: EpistemicMassDistribution): number {
  const keys = new Set([...Object.keys(a.masses), ...Object.keys(b.masses)]);
  let s = 0;
  for (const k of keys) {
    s += Math.abs((a.masses[k] ?? 0) - (b.masses[k] ?? 0));
  }
  return s;
}

/** Shannon entropy of normalized beliefs — higher ⇒ more diffuse epistemic state. */
export function beliefEntropy(b: EpistemicMassDistribution): number {
  const n = normalizeBeliefs(b);
  let h = 0;
  for (const p of Object.values(n.masses)) {
    if (p > 1e-12) h -= p * Math.log2(p);
  }
  return h;
}

export function ecusUniverseState(
  beliefs: EpistemicMassDistribution,
  causalKernel: CausalInteractionKernel,
): EcusUniverseState {
  return {
    schema: ECUS_SCHEMA,
    beliefs,
    causalKernel,
  };
}

/**
 * Core ECUS constraint (finite proxy): positive belief mass on target AND modal accessibility
 * from anchor under shared physics tolerance.
 */
export function epistemicallyCausalAdmissible(
  beliefs: EpistemicMassDistribution,
  targetWorld: CausalWorld,
  anchorWorld: CausalWorld,
  options?: {
    minBeliefMass?: number;
    divergenceThreshold?: number;
  },
): { admissible: boolean; violations: string[] } {
  const violations: string[] = [];
  const minB = options?.minBeliefMass ?? 1e-9;
  const m = beliefMass(beliefs, targetWorld.worldId);
  if (m <= minB) violations.push('ZERO_OR_TINY_BELIEF_MASS');
  const acc = evaluateAccessibility(anchorWorld, targetWorld, options);
  if (!acc.accessibleUnderThreshold) violations.push('MODALLY_INACCESSIBLE');
  return {
    admissible: violations.length === 0,
    violations,
  };
}

export function triadicReplayConsistency(
  exec: EcusUniverseState,
  shadow: EcusUniverseState,
  anchorWorld: CausalWorld,
  execWorld: CausalWorld,
  shadowWorld: CausalWorld,
  options?: {
    beliefL1Tol?: number;
    reachabilityScoreTol?: number;
  },
): EcusTriadicConsistencyWitness {
  const nE = normalizeBeliefs(exec.beliefs);
  const nS = normalizeBeliefs(shadow.beliefs);
  const l1Belief = beliefL1Distance(nE, nS);
  const kernelAligned =
    fingerprintCausalKernel(exec.causalKernel) === fingerprintCausalKernel(shadow.causalKernel);

  const rE = evaluateAccessibility(anchorWorld, execWorld);
  const rS = evaluateAccessibility(anchorWorld, shadowWorld);
  const tol = options?.reachabilityScoreTol ?? 0.2;
  const modalReachabilityAligned =
    Math.abs(rE.accessibilityScore - rS.accessibilityScore) <= tol;

  const bTol = options?.beliefL1Tol ?? 0.15;
  const triadicallyConsistent =
    l1Belief <= bTol &&
    kernelAligned &&
    modalReachabilityAligned;

  return {
    schema: ECUS_TRIADIC_WITNESS_SCHEMA,
    beliefL1Distance: l1Belief,
    kernelAligned,
    modalReachabilityAligned,
    triadicallyConsistent,
  };
}

export function classifyEcusEpistemicTier(
  witness: EcusTriadicConsistencyWitness,
  entropy: number,
  entropyRevisionThreshold = 0.85,
): EcusEpistemicTier {
  if (witness.triadicallyConsistent && entropy <= entropyRevisionThreshold) {
    return 'EPISTEMIC_LOCAL';
  }
  return 'EPISTEMIC_REVISION';
}

/** Stub SPCL / belief update — pull mass toward `focusWorldId`. */
export function beliefRevisionTowardWorld(
  beliefs: EpistemicMassDistribution,
  focusWorldId: string,
  eta: number,
): EpistemicMassDistribution {
  const n = normalizeBeliefs(beliefs);
  const masses: Record<string, number> = { ...n.masses };
  const keys = Object.keys(masses);
  if (!keys.length) return { masses: { [focusWorldId]: 1 } };
  const pull = Math.min(1, Math.max(0, eta));
  for (const k of keys) {
    if (k === focusWorldId) continue;
    const transfer = masses[k]! * pull;
    masses[k] = masses[k]! - transfer;
    masses[focusWorldId] = (masses[focusWorldId] ?? 0) + transfer;
  }
  return normalizeBeliefs({ masses });
}
