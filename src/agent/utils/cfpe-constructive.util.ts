/**
 * CFPE — contraction toward Φ*, closure in valid Φ, repair via SPCL/PCCS channel.
 */

import type { CausalFieldSnapshot } from '../contracts/multi-agent-causal-field.types';
import type { CfpeEngineeringWitness, CfpeSystemTier } from '../contracts/cfpe.types';
import {
  CFPE_ENGINEERING_WITNESS_SCHEMA,
} from '../contracts/cfpe.types';
import type { ExecutionCertificate } from '../contracts/pccs-ei.types';
import { judgeValidStateField } from './ctt-ei-judgement.util';
import { discreteGeodesicEnergy, snapshotPhiRmsDistance } from './gpm-ei-manifold.util';
import { proofRepairNeeded } from './pccs-ei-certificate.util';

function distToAttractor(phi: CausalFieldSnapshot, sStar: CausalFieldSnapshot): number {
  return snapshotPhiRmsDistance(phi, sStar);
}

/**
 * ‖Φₜ₊₁ − Φ*‖ ≤ λ ‖Φₜ − Φ*‖ for each adjacent pair along path (λ ∈ (0,1) upper bound as `lambdaMax`).
 */
export function cfpeContractionAlongPath(
  phiPath: CausalFieldSnapshot[],
  sStar: CausalFieldSnapshot,
  lambdaMax: number,
): boolean {
  if (phiPath.length < 2) return true;
  for (let i = 1; i < phiPath.length; i++) {
    const d0 = distToAttractor(phiPath[i - 1]!, sStar);
    const d1 = distToAttractor(phiPath[i]!, sStar);
    if (d0 <= 1e-12) continue;
    if (d1 > d0 * lambdaMax + 1e-12) return false;
  }
  return true;
}

export function cfpeTailContractionRatio(
  phiPath: CausalFieldSnapshot[],
  sStar: CausalFieldSnapshot,
): number | null {
  if (phiPath.length < 2) return null;
  const d0 = distToAttractor(phiPath[phiPath.length - 2]!, sStar);
  const d1 = distToAttractor(phiPath[phiPath.length - 1]!, sStar);
  if (d0 <= 1e-15) return d1 <= 1e-15 ? 1 : null;
  return d1 / d0;
}

/** 𝒪(Φ) ∈ valid state manifold (unit-interval toy envelope). */
export function cfpeClosureSatisfied(phi: CausalFieldSnapshot): boolean {
  return judgeValidStateField(phi).holds;
}

/** Repair exists when PCCS carries SPCL samples or π demands repair (Δ𝒪 hook). */
export function cfpeRepairChannelAvailable(cert?: ExecutionCertificate): boolean {
  if (!cert) return false;
  const hasSample =
    Object.keys(cert.spclSample.deltaPhiExec).length > 0 ||
    Object.keys(cert.spclSample.deltaPhiShadow).length > 0;
  return hasSample || proofRepairNeeded(cert);
}

/**
 * NCGES as contraction envelope: ∑‖ΔΦ‖²_shadow ≤ ∑‖ΔΦ‖²_exec + tol (same length paths).
 */
export function shadowContractionEnvelopeConsistent(
  execPath: CausalFieldSnapshot[],
  shadowPath: CausalFieldSnapshot[],
  energyTol = 1e-9,
): boolean {
  const ee = discreteGeodesicEnergy(execPath);
  const es = discreteGeodesicEnergy(shadowPath);
  return es <= ee + energyTol;
}

export function evaluateCfpeEngineeringWitness(
  phiPath: CausalFieldSnapshot[],
  sStar: CausalFieldSnapshot,
  currentPhi: CausalFieldSnapshot,
  options?: {
    lambdaMax?: number;
    cert?: ExecutionCertificate;
    execPathForEnvelope?: CausalFieldSnapshot[];
    shadowPathForEnvelope?: CausalFieldSnapshot[];
    envelopeEnergyTol?: number;
  },
): CfpeEngineeringWitness {
  const lambdaMax = options?.lambdaMax ?? 0.99;
  const contractionSatisfied = cfpeContractionAlongPath(phiPath, sStar, lambdaMax);
  const closureSatisfied = cfpeClosureSatisfied(currentPhi);
  const repairChannelAvailable = cfpeRepairChannelAvailable(options?.cert);
  const tailContractionRatio = cfpeTailContractionRatio(phiPath, sStar);

  let shadowEnvelopeConsistent: boolean | null = null;
  if (
    options?.execPathForEnvelope &&
    options?.shadowPathForEnvelope &&
    options.execPathForEnvelope.length >= 2 &&
    options.shadowPathForEnvelope.length >= 2
  ) {
    shadowEnvelopeConsistent = shadowContractionEnvelopeConsistent(
      options.execPathForEnvelope,
      options.shadowPathForEnvelope,
      options.envelopeEnergyTol,
    );
  }

  return {
    schema: CFPE_ENGINEERING_WITNESS_SCHEMA,
    contractionSatisfied,
    closureSatisfied,
    repairChannelAvailable,
    tailContractionRatio,
    shadowEnvelopeConsistent,
  };
}

export function classifyCfpeSystemTier(w: CfpeEngineeringWitness): CfpeSystemTier {
  const core = w.contractionSatisfied && w.closureSatisfied && w.repairChannelAvailable;
  const envelopeOk = w.shadowEnvelopeConsistent !== false;
  return core && envelopeOk ? 'SYSTEM1_CFPE' : 'SYSTEM2_CFPE';
}
