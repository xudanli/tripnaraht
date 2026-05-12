/**
 * GPM-EI — discrete trajectories in Φ-space as manifold proxies; ε_geom from path separation.
 */

import type { CausalFieldSnapshot, CausalInteractionKernel } from '../contracts/multi-agent-causal-field.types';
import type {
  GeodesicPathBudget,
  GpmTrajectoryWitness,
  OperatorManifoldPoint,
} from '../contracts/gpm-ei.types';
import { GPM_EI_TRAJECTORY_WITNESS_SCHEMA } from '../contracts/gpm-ei.types';
import type { ExecutionCertificate } from '../contracts/pccs-ei.types';
import { fingerprintCausalKernel } from './pccs-ei-certificate.util';

/** ‖Φ_a − Φ_b‖₂ / √n over shared agent ids (discrete metric on Φ). */
export function snapshotPhiRmsDistance(a: CausalFieldSnapshot, b: CausalFieldSnapshot): number {
  const byId = new Map(b.particles.map((p) => [p.agentId, p.phi]));
  let sumSq = 0;
  let n = 0;
  for (const p of a.particles) {
    const q = byId.get(p.agentId);
    const qv = q !== undefined ? q : p.phi;
    const d = p.phi - qv;
    sumSq += d * d;
    n += 1;
  }
  if (!n) return 0;
  return Math.sqrt(sumSq / n);
}

/** ∑ᵢ ‖Φ_{i+1} − Φ_i‖² — discrete “energy” along τ (geodesic surrogate). */
export function discreteGeodesicEnergy(path: CausalFieldSnapshot[]): number {
  if (path.length < 2) return 0;
  let e = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const d = snapshotPhiRmsDistance(path[i]!, path[i + 1]!);
    e += d * d;
  }
  return e;
}

function meanStepNorm(path: CausalFieldSnapshot[]): number {
  if (path.length < 2) return 0;
  let s = 0;
  let k = 0;
  for (let i = 0; i < path.length - 1; i++) {
    s += snapshotPhiRmsDistance(path[i]!, path[i + 1]!);
    k += 1;
  }
  return k ? s / k : 0;
}

/**
 * ε_geom ≈ RMS_t dist(τ_exec(t), τ_shadow(t)) in Φ (paths aligned by index).
 * Paths shorter on one side are truncated to common prefix length.
 */
export function epsilonGeomDualPaths(
  execPath: CausalFieldSnapshot[],
  shadowPath: CausalFieldSnapshot[],
): number {
  const n = Math.min(execPath.length, shadowPath.length);
  if (!n) return Number.POSITIVE_INFINITY;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const d = snapshotPhiRmsDistance(execPath[i]!, shadowPath[i]!);
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / n);
}

export function operatorManifoldPoint(kernel: CausalInteractionKernel): OperatorManifoldPoint {
  return {
    kernelFingerprint: fingerprintCausalKernel(kernel),
    causalKernel: kernel,
  };
}

/** Bundle geometric witnesses for replay / SPCL curvature-flow hooks. */
export function buildGpmTrajectoryWitness(
  execPath: CausalFieldSnapshot[],
  shadowPath: CausalFieldSnapshot[],
): GpmTrajectoryWitness {
  return {
    schema: GPM_EI_TRAJECTORY_WITNESS_SCHEMA,
    epsilonGeomRms: epsilonGeomDualPaths(execPath, shadowPath),
    execGeodesicEnergy: discreteGeodesicEnergy(execPath),
    shadowGeodesicEnergy: discreteGeodesicEnergy(shadowPath),
    execMeanStepNorm: meanStepNorm(execPath),
    shadowMeanStepNorm: meanStepNorm(shadowPath),
  };
}

/** SYSTEM1-like region when dual paths stay close in Φ-RMS sense. */
export function withinGeodesicNeighborhood(
  witness: GpmTrajectoryWitness,
  budget: GeodesicPathBudget,
): boolean {
  return witness.epsilonGeomRms <= budget.maxEpsilonGeomRms;
}

/** Chain of PCCS certificates → paired trajectories [Φ_exec], [Φ_shadow] along ticks. */
export function trajectoriesFromCertificateChain(certs: ExecutionCertificate[]): {
  execPath: CausalFieldSnapshot[];
  shadowPath: CausalFieldSnapshot[];
} {
  return {
    execPath: certs.map((c) => c.phiExec),
    shadowPath: certs.map((c) => c.phiShadow),
  };
}
