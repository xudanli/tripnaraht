/**
 * HT-CET — discrete sheaf patches, overlap consistency, gluing vs exec/shadow sections.
 */

import type { CausalFieldSnapshot } from '../contracts/multi-agent-causal-field.types';
import type {
  CausalSheafBundle,
  CausalSheafPatch,
  CohomologyObstructionDigest,
  SheafGluingWitness,
} from '../contracts/ht-cet.types';
import {
  HT_CET_GLUING_WITNESS_SCHEMA,
  HT_CET_SHEAF_BUNDLE_SCHEMA,
} from '../contracts/ht-cet.types';
import type { SpclErrorBundle } from '../contracts/shadow-policy-calibration.types';
import type { GpmTrajectoryWitness } from '../contracts/gpm-ei.types';
import type { ExecutionCertificate } from '../contracts/pccs-ei.types';
import { snapshotPhiRmsDistance } from './gpm-ei-manifold.util';

function particleLatticeKey(phi: CausalFieldSnapshot): string {
  return [...phi.particles.map((p) => p.agentId)].sort().join('|');
}

function restrictToAgents(
  phi: CausalFieldSnapshot,
  agentIds: Set<string>,
): CausalFieldSnapshot {
  return {
    ...phi,
    particles: phi.particles.filter((p) => agentIds.has(p.agentId)),
  };
}

function intersectionAgents(a: CausalFieldSnapshot, b: CausalFieldSnapshot): Set<string> {
  const sa = new Set(a.particles.map((p) => p.agentId));
  const out = new Set<string>();
  for (const p of b.particles) {
    if (sa.has(p.agentId)) out.add(p.agentId);
  }
  return out;
}

/** Pairwise overlap consistency on shared agents — max RMS gap across all patch pairs. */
export function checkSheafPatchConsistency(
  patches: CausalSheafPatch[],
  toleranceRms: number,
): SheafGluingWitness {
  if (patches.length < 2) {
    return {
      schema: HT_CET_GLUING_WITNESS_SCHEMA,
      gluingResidualMax: 0,
      locallyGluable: true,
    };
  }

  let gluingResidualMax = 0;
  for (let i = 0; i < patches.length; i++) {
    for (let j = i + 1; j < patches.length; j++) {
      const pi = patches[i]!;
      const pj = patches[j]!;
      const inter = intersectionAgents(pi.phi, pj.phi);
      if (!inter.size) continue;
      const ri = restrictToAgents(pi.phi, inter);
      const rj = restrictToAgents(pj.phi, inter);
      const d = snapshotPhiRmsDistance(ri, rj);
      gluingResidualMax = Math.max(gluingResidualMax, d);
    }
  }

  return {
    schema: HT_CET_GLUING_WITNESS_SCHEMA,
    gluingResidualMax,
    locallyGluable: gluingResidualMax <= toleranceRms,
  };
}

export function buildCausalSheafBundle(patches: CausalSheafPatch[]): CausalSheafBundle {
  return {
    schema: HT_CET_SHEAF_BUNDLE_SCHEMA,
    patches,
  };
}

/** Global section proxy: all patches share one lattice and pairwise RMS ≤ τ. */
export function admitsGlobalSectionStub(
  bundle: CausalSheafBundle,
  toleranceRms: number,
): boolean {
  const keys = new Set(bundle.patches.map((p) => particleLatticeKey(p.phi)));
  if (keys.size > 1) return false;
  return checkSheafPatchConsistency(bundle.patches, toleranceRms).locallyGluable;
}

/**
 * Gluing exec vs shadow “sections” — uses PCCS ε + optional GPM ε_geom as obstruction inputs.
 */
export function execShadowGluingResidual(
  cert: ExecutionCertificate,
  gpm?: GpmTrajectoryWitness,
): number {
  const eps0 = cert.epsilon.l2Norm;
  if (!gpm) return eps0;
  return Math.max(eps0, gpm.epsilonGeomRms);
}

export function cohomologyObstructionDigest(
  spcl: SpclErrorBundle,
  extraGeom?: number,
  collapseFloor = 1e-6,
): CohomologyObstructionDigest {
  const obstructionScore = Math.max(spcl.l2Norm, extraGeom ?? 0);
  return {
    obstructionScore,
    collapsesToZero: obstructionScore <= collapseFloor,
  };
}
