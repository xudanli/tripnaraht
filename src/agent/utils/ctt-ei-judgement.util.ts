/**
 * CTT-EI judgement helpers — runtime type checker for causal operator programs (witnesses, not Coq).
 */

import type { CausalFieldSnapshot } from '../contracts/multi-agent-causal-field.types';
import type {
  CttEpsilonThresholds,
  CttJudgement,
  CttSystemTier,
  ReplayTypingJudgement,
  ResidualFieldWitness,
} from '../contracts/ctt-ei.types';
import type { SpclObservationSample } from '../contracts/shadow-policy-calibration.types';
import { computeSpclError } from './shadow-policy-calibration.util';

const DEFAULT_THRESHOLDS: CttEpsilonThresholds = {
  tauLow: 0.05,
  tauHigh: 0.25,
};

/** ⊢ Φ : StateField — finite φ, non-empty agents, optional [0,1] envelope for toy ECPS fields. */
export function judgeValidStateField(phi: CausalFieldSnapshot): CttJudgement<CausalFieldSnapshot> {
  const violations: string[] = [];
  if (!phi.queryId?.length) violations.push('MISSING_QUERY_ID');
  if (!phi.particles?.length) violations.push('EMPTY_PARTICLES');
  for (const p of phi.particles ?? []) {
    if (!p.agentId?.length) violations.push('MISSING_AGENT_ID');
    if (!Number.isFinite(p.phi)) violations.push(`NON_FINITE_PHI:${p.agentId}`);
    const x = p.phi;
    if (x < 0 || x > 1) violations.push(`PHI_OUTSIDE_UNIT_INTERVAL:${p.agentId}`);
  }
  return {
    holds: violations.length === 0,
    witness: violations.length === 0 ? phi : undefined,
    violations,
  };
}

/** ⊢ 𝒪_exec(Φ), ⊢ 𝒪_shadow(Φ) — both outputs must be valid states under the same rules. */
export function judgeDualOperatorOutputs(
  phiExec: CausalFieldSnapshot,
  phiShadow: CausalFieldSnapshot,
): CttJudgement<{ exec: CausalFieldSnapshot; shadow: CausalFieldSnapshot }> {
  const jE = judgeValidStateField(phiExec);
  const jS = judgeValidStateField(phiShadow);
  const violations = [...jE.violations.map((v) => `EXEC:${v}`), ...jS.violations.map((v) => `SHADOW:${v}`)];
  const holds = jE.holds && jS.holds;
  return {
    holds,
    witness: holds ? { exec: phiExec, shadow: phiShadow } : undefined,
    violations,
  };
}

/** ⊢ ε : ResidualField — well-formed paired increments + bundle. */
export function judgeResidualWellFormed(sample: SpclObservationSample): CttJudgement<ResidualFieldWitness> {
  const keys = new Set([
    ...Object.keys(sample.deltaPhiExec),
    ...Object.keys(sample.deltaPhiShadow),
  ]);
  if (!keys.size) {
    return { holds: false, violations: ['EMPTY_RESIDUAL_KEYS'] };
  }
  for (const k of keys) {
    const a = sample.deltaPhiExec[k];
    const b = sample.deltaPhiShadow[k];
    if (a !== undefined && !Number.isFinite(a)) {
      return { holds: false, violations: [`NON_FINITE_DELTA_EXEC:${k}`] };
    }
    if (b !== undefined && !Number.isFinite(b)) {
      return { holds: false, violations: [`NON_FINITE_DELTA_SHADOW:${k}`] };
    }
  }
  const bundle = computeSpclError(sample);
  return {
    holds: true,
    witness: { sample, bundle },
    violations: [],
  };
}

/** Geometry partition: SYSTEM1 low ||ε||, SYSTEM2 high, band between. */
export function classifyCttSystemTier(
  l2NormEpsilon: number,
  thresholds: CttEpsilonThresholds = DEFAULT_THRESHOLDS,
): CttSystemTier {
  if (l2NormEpsilon < thresholds.tauLow) return 'SYSTEM1';
  if (l2NormEpsilon >= thresholds.tauHigh) return 'SYSTEM2';
  return 'INTER_REGION';
}

/** ECPS-style mode hook from ε-geometry (type-directed selector stub). */
export function ecpsDivergenceModeFromTier(
  tier: CttSystemTier,
): 'LOW_DIVERGENCE' | 'MIXED_DIVERGENCE' | 'HIGH_DIVERGENCE' {
  if (tier === 'SYSTEM1') return 'LOW_DIVERGENCE';
  if (tier === 'INTER_REGION') return 'MIXED_DIVERGENCE';
  return 'HIGH_DIVERGENCE';
}

/** Replay: Φ_t → Φ_{t+1} preserves structural typing when both states judge valid. */
export function judgeReplayTemporalTyping(
  phiT: CausalFieldSnapshot,
  phiNext: CausalFieldSnapshot,
): CttJudgement<ReplayTypingJudgement> {
  const j0 = judgeValidStateField(phiT);
  const j1 = judgeValidStateField(phiNext);
  const idsT = new Set(phiT.particles.map((p) => p.agentId));
  const idsN = new Set(phiNext.particles.map((p) => p.agentId));
  let lattice = idsT.size === idsN.size;
  if (lattice) {
    for (const id of idsT) {
      if (!idsN.has(id)) {
        lattice = false;
        break;
      }
    }
  }
  const consecutiveStructuralValidity = j0.holds && j1.holds;
  const witness: ReplayTypingJudgement = {
    preservesParticleLattice: lattice,
    consecutiveStructuralValidity,
  };
  const holds = consecutiveStructuralValidity && lattice;
  const violations = [...j0.violations.map((v) => `PHI_T:${v}`), ...j1.violations.map((v) => `PHI_NEXT:${v}`)];
  if (!lattice) violations.push('PARTICLE_LATTICE_MISMATCH');
  return { holds, witness, violations };
}

/** SPCL witness as type refinement signal (ε → summary for Kθ hooks). */
export function spclResidualWitness(sample: SpclObservationSample): ResidualFieldWitness {
  return {
    sample,
    bundle: computeSpclError(sample),
  };
}

export function getDefaultCttEpsilonThresholds(): CttEpsilonThresholds {
  return { ...DEFAULT_THRESHOLDS };
}
