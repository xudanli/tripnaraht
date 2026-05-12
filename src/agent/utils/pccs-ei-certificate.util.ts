/**
 * PCCS-EI — build and inspect **ExecutionCertificate** from dual projections + Kθ trace.
 */

import type { CausalInteractionKernel, CausalFieldSnapshot } from '../contracts/multi-agent-causal-field.types';
import {
  PCCS_EI_CERTIFICATE_SCHEMA,
  PCCS_EI_PROOF_SCHEMA,
  type ExecutionCertificate,
  type KthetaTrace,
  type PccsCertificateOptions,
  type PccsProofComplexity,
  type PccsProofWitness,
} from '../contracts/pccs-ei.types';
import type { OfdlProjectionMode } from '../contracts/ofdl.types';
import type { SpclErrorBundle, SpclObservationSample } from '../contracts/shadow-policy-calibration.types';
import {
  classifyCttSystemTier,
  getDefaultCttEpsilonThresholds,
  judgeDualOperatorOutputs,
  judgeResidualWellFormed,
} from './ctt-ei-judgement.util';
import { computeSpclError } from './shadow-policy-calibration.util';

export function fingerprintCausalKernel(kernel: CausalInteractionKernel): string {
  return `kθ:${kernel.agentOrder.join('|')}:${JSON.stringify(kernel.matrix)}`;
}

function buildKthetaTrace(
  kernel: CausalInteractionKernel,
  execMode: OfdlProjectionMode,
): KthetaTrace {
  return {
    kernelFingerprint: fingerprintCausalKernel(kernel),
    execMode,
    shadowMode: 'SHADOW',
  };
}

function buildPccsProofWitness(
  phiExec: CausalFieldSnapshot,
  phiShadow: CausalFieldSnapshot,
  sample: SpclObservationSample,
  epsilon: SpclErrorBundle,
  options?: PccsCertificateOptions,
): PccsProofWitness {
  const jDual = judgeDualOperatorOutputs(phiExec, phiShadow);
  const jRes = judgeResidualWellFormed(sample);
  const spclMax = options?.spclMaxAbsEpsilon ?? 1;
  const spclBounded = epsilon.maxAbsEpsilon <= spclMax;

  const cttStateTyping = jDual.holds;
  const residualWellFormed = jRes.holds;
  const cmaftNcgesDualConsistency = jDual.holds && jRes.holds;

  const violations: string[] = [...jDual.violations, ...jRes.violations];
  if (!spclBounded) violations.push('SPCL_EPSILON_UNBOUNDED');

  const constraintSurface = {
    cmaftNcgesDualConsistency,
    spclEpsilonBounded: spclBounded,
    cttStateTyping,
    residualWellFormed,
  };

  const holds =
    cttStateTyping &&
    residualWellFormed &&
    spclBounded &&
    cmaftNcgesDualConsistency;

  const thresholds = getDefaultCttEpsilonThresholds();
  const tier = classifyCttSystemTier(epsilon.l2Norm, thresholds);

  const proofComplexity: PccsProofComplexity =
    holds && tier === 'SYSTEM1' ? 'SHORT' : 'FULL';

  const obligationsSatisfied: string[] = [];
  if (jDual.holds) obligationsSatisfied.push('CTT_VALID_STATE_DUAL');
  if (jRes.holds) obligationsSatisfied.push('CTT_RESIDUAL_WELL_FORMED');
  if (spclBounded) obligationsSatisfied.push('SPCL_EPSILON_ABS_BOUND');
  if (holds) obligationsSatisfied.push('PCCS_SURFACE_COMPLETE');

  return {
    schema: PCCS_EI_PROOF_SCHEMA,
    holds,
    obligationsSatisfied,
    violations,
    constraintSurface,
    proofComplexity,
  };
}

/** Assemble 𝒞 from dual Φ outputs, paired ΔΦ sample, and Kθ trace inputs. */
export function buildExecutionCertificate(
  input: {
    phiExec: CausalFieldSnapshot;
    phiShadow: CausalFieldSnapshot;
    spclSample: SpclObservationSample;
    causalKernel: CausalInteractionKernel;
    execMode: OfdlProjectionMode;
    options?: PccsCertificateOptions;
  },
): ExecutionCertificate {
  const epsilon = computeSpclError(input.spclSample);
  const piProof = buildPccsProofWitness(
    input.phiExec,
    input.phiShadow,
    input.spclSample,
    epsilon,
    input.options,
  );
  return {
    schema: PCCS_EI_CERTIFICATE_SCHEMA,
    phiExec: input.phiExec,
    phiShadow: input.phiShadow,
    epsilon,
    piProof,
    kThetaTrace: buildKthetaTrace(input.causalKernel, input.execMode),
    spclSample: input.spclSample,
  };
}

export function validExecutionCertificate(cert: ExecutionCertificate): boolean {
  return cert.piProof.holds;
}

/** SPCL “proof repair” hook — Kθ update indicated when π fails or obligations missing. */
export function proofRepairNeeded(cert: ExecutionCertificate): boolean {
  return !cert.piProof.holds || cert.piProof.proofComplexity === 'FULL';
}

/** SYSTEM1 ≈ short proof path exists; SYSTEM2 ≈ full derivation / repair. */
export function classifyPccsSystemTier(cert: ExecutionCertificate): 'SYSTEM1' | 'SYSTEM2' {
  return cert.piProof.holds && cert.piProof.proofComplexity === 'SHORT'
    ? 'SYSTEM1'
    : 'SYSTEM2';
}
