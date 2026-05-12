/**
 * FPTI — stability under discrete dynamics; failure modes; OCT triple proximity.
 */

import type { CausalFieldSnapshot } from '../contracts/multi-agent-causal-field.types';
import type { EpistemicMassDistribution } from '../contracts/ecus.types';
import type {
  FptiConvergenceBasin,
  FptiFixedPointWitness,
  FptiTrajectoryWitness,
} from '../contracts/fpti.types';
import {
  FPTI_TRAJECTORY_SCHEMA,
} from '../contracts/fpti.types';
import type { OntologicalTriple } from '../contracts/oct.types';
import { snapshotPhiRmsDistance } from './gpm-ei-manifold.util';
import { beliefL1Distance, normalizeBeliefs } from './ecus-synthesis.util';

function snapshotSig(s: CausalFieldSnapshot): string {
  return s.particles.map((p) => `${p.agentId}:${p.phi.toFixed(8)}`).join('|');
}

function particleVariance(snapshot: CausalFieldSnapshot): number {
  if (!snapshot.particles.length) return 0;
  const vals = snapshot.particles.map((p) => p.phi);
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  let v = 0;
  for (const x of vals) v += (x - m) ** 2;
  return v / vals.length;
}

/** Φ-path guards: invalid domain → divergence; 2-cycle tail → oscillation; variance collapse → collapse. */
export function classifyPhiTrajectory(
  phiPath: CausalFieldSnapshot[],
  options?: {
    collapseVarianceBelow?: number;
  },
): FptiTrajectoryWitness {
  const notes: string[] = [];
  const collapseBelow = options?.collapseVarianceBelow ?? 1e-10;

  if (phiPath.length < 2) {
    return { schema: FPTI_TRAJECTORY_SCHEMA, failureMode: 'NONE', notes: ['TRAJECTORY_TOO_SHORT'] };
  }

  for (const s of phiPath) {
    for (const p of s.particles) {
      if (!Number.isFinite(p.phi)) {
        notes.push('NON_FINITE_PHI');
        return { schema: FPTI_TRAJECTORY_SCHEMA, failureMode: 'DIVERGENCE', notes };
      }
      if (p.phi < 0 || p.phi > 1) {
        notes.push('PHI_LEFT_UNIT_INTERVAL');
        return { schema: FPTI_TRAJECTORY_SCHEMA, failureMode: 'DIVERGENCE', notes };
      }
    }
  }

  const last = phiPath[phiPath.length - 1]!;
  if (particleVariance(last) < collapseBelow) {
    notes.push('PARTICLE_VARIANCE_COLLAPSE');
    return { schema: FPTI_TRAJECTORY_SCHEMA, failureMode: 'COLLAPSE', notes };
  }

  if (phiPath.length >= 4) {
    const n = phiPath.length;
    const a0 = snapshotSig(phiPath[n - 4]!);
    const a1 = snapshotSig(phiPath[n - 3]!);
    const b0 = snapshotSig(phiPath[n - 2]!);
    const b1 = snapshotSig(phiPath[n - 1]!);
    if (a0 === b0 && a1 === b1 && a0 !== a1) {
      notes.push('DETECTED_PERIOD_2_TAIL');
      return { schema: FPTI_TRAJECTORY_SCHEMA, failureMode: 'OSCILLATION', notes };
    }
  }

  return { schema: FPTI_TRAJECTORY_SCHEMA, failureMode: 'NONE', notes: ['NO_FAILURE_DETECTED'] };
}

/** RMS(S) + mismatch on 𝒪 fingerprint + 𝒞 holds equality — distance between compressed ontologies. */
export function structuralResidualOct(a: OntologicalTriple, b: OntologicalTriple): number {
  const dS = snapshotPhiRmsDistance(a.S.phi, b.S.phi);
  const dO =
    a.O.kernelFingerprint !== b.O.kernelFingerprint ||
    a.O.execMode !== b.O.execMode ||
    a.O.shadowMode !== b.O.shadowMode
      ? 1
      : 0;
  const dC = a.C.holds === b.C.holds ? 0 : 1;
  return Math.sqrt(dS * dS + dO * dO + dC * dC);
}

/** Minimum pairwise residual over tail windows — approximate fixed point of F on Ω. */
export function witnessOntologicalFixedPoint(
  tripleSequence: OntologicalTriple[],
  tolerance: number,
  tailLength = 4,
): FptiFixedPointWitness {
  const n = tripleSequence.length;
  if (n < 2) {
    return {
      admitsApproximateFixedPoint: false,
      minimumStructuralResidual: Number.POSITIVE_INFINITY,
      tailLengthConsidered: n,
    };
  }
  const start = Math.max(0, n - tailLength);
  let minRes = Number.POSITIVE_INFINITY;
  for (let i = start; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = structuralResidualOct(tripleSequence[i]!, tripleSequence[j]!);
      minRes = Math.min(minRes, r);
    }
  }
  return {
    admitsApproximateFixedPoint: minRes <= tolerance,
    minimumStructuralResidual: minRes,
    tailLengthConsidered: n - start,
  };
}

/** 𝔅 stable if L1 drift small after revision / observation. */
export function beliefNearFixedPoint(
  before: EpistemicMassDistribution,
  after: EpistemicMassDistribution,
  l1Tol: number,
): boolean {
  return beliefL1Distance(normalizeBeliefs(before), normalizeBeliefs(after)) <= l1Tol;
}

/** SYSTEM1 attractor proxy vs SYSTEM2 escape (uses OCT structural residual + optional trajectory failure). */
export function ecpsConvergenceBasinStub(
  octResidualToPrior: number,
  traj: FptiTrajectoryWitness,
  residualTol = 0.08,
): FptiConvergenceBasin {
  if (traj.failureMode !== 'NONE') return 'OUTSIDE_ATTRACTOR';
  return octResidualToPrior <= residualTol ? 'IN_ATTRACTOR' : 'OUTSIDE_ATTRACTOR';
}
