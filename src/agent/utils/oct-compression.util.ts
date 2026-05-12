/**
 * OCT — project layered stacks onto ⟨S, 𝒪, 𝒞⟩; single compression API.
 */

import type { CausalInteractionKernel, CausalFieldSnapshot } from '../contracts/multi-agent-causal-field.types';
import type { OfdlProjectionMode } from '../contracts/ofdl.types';
import type { EcusTriadicConsistencyWitness, EcusUniverseState } from '../contracts/ecus.types';
import type {
  OntologicalTriple,
  OctConstraintWitness,
  OctOperatorWitness,
  OctStateWitness,
} from '../contracts/oct.types';
import { OCT_UNIVERSE_SCHEMA } from '../contracts/oct.types';
import type { ExecutionCertificate } from '../contracts/pccs-ei.types';
import type { PccsProofWitness } from '../contracts/pccs-ei.types';
import { fingerprintCausalKernel } from './pccs-ei-certificate.util';

/** 𝒞 from PCCS π_proof surface. */
export function constraintWitnessFromPccsProof(pi: PccsProofWitness): OctConstraintWitness {
  return {
    holds: pi.holds,
    obligationsSatisfied: [...pi.obligationsSatisfied],
    violations: [...pi.violations],
  };
}

/** 𝒞 from ECUS triadic witness — collapses replay consistency into constraint satisfaction. */
export function constraintWitnessFromEcusTriadic(w: EcusTriadicConsistencyWitness): OctConstraintWitness {
  const violations: string[] = [];
  if (!w.kernelAligned) violations.push('KERNEL_MISMATCH');
  if (!w.modalReachabilityAligned) violations.push('MODAL_REACHABILITY_MISMATCH');
  if (w.beliefL1Distance > 1e-9) violations.push(`BELIEF_L1:${w.beliefL1Distance.toFixed(6)}`);
  return {
    holds: w.triadicallyConsistent,
    obligationsSatisfied: w.triadicallyConsistent ? ['ECUS_TRIADIC_CONSISTENCY'] : [],
    violations,
  };
}

export function operatorWitness(
  kernelFingerprint: string,
  execMode: OfdlProjectionMode,
  causalKernel?: CausalInteractionKernel,
): OctOperatorWitness {
  return {
    kernelFingerprint,
    execMode,
    shadowMode: 'SHADOW',
    causalKernel,
  };
}

export function stateWitness(phi: CausalFieldSnapshot): OctStateWitness {
  return { phi };
}

export function buildOntologicalTriple(
  S: OctStateWitness,
  O: OctOperatorWitness,
  C: OctConstraintWitness,
): OntologicalTriple {
  return {
    schema: OCT_UNIVERSE_SCHEMA,
    S,
    O,
    C,
  };
}

/** Full PCCS certificate → Ω (primary compression path). */
export function octCompressFromExecutionCertificate(cert: ExecutionCertificate): OntologicalTriple {
  const O: OctOperatorWitness = {
    kernelFingerprint: cert.kThetaTrace.kernelFingerprint,
    execMode: cert.kThetaTrace.execMode,
    shadowMode: cert.kThetaTrace.shadowMode,
  };
  return buildOntologicalTriple(
    stateWitness(cert.phiExec),
    O,
    constraintWitnessFromPccsProof(cert.piProof),
  );
}

/** Attach full Kθ onto 𝒪 when caller has the matrix (same fingerprint as certificate trace). */
export function octCompressFromExecutionCertificateWithKernel(
  cert: ExecutionCertificate,
  causalKernel: CausalInteractionKernel,
): OntologicalTriple {
  const t = octCompressFromExecutionCertificate(cert);
  return buildOntologicalTriple(t.S, { ...t.O, causalKernel }, t.C);
}

/**
 * ECUS 𝒰 + triadic witness → Ω (belief masses dropped — OCT keeps structural 𝒞 from ECUS replay).
 * 𝔅 lives above OCT; compress **constraint evolution** here only.
 */
export function octCompressFromEcusTriadic(
  phiRepresentative: CausalFieldSnapshot,
  universe: EcusUniverseState,
  triadic: EcusTriadicConsistencyWitness,
): OntologicalTriple {
  const fp = fingerprintCausalKernel(universe.causalKernel);
  return buildOntologicalTriple(
    stateWitness(phiRepresentative),
    operatorWitness(fp, 'EXEC', universe.causalKernel),
    constraintWitnessFromEcusTriadic(triadic),
  );
}

/** Static projection map — documentation for tooling / UI (no runtime behavior). */
export const OCT_LAYER_ROLES: Record<string, 'S' | 'O' | 'C' | 'SOC'> = {
  ECUS: 'SOC',
  MCUT: 'S',
  'CT-CES': 'O',
  'HT-CET': 'C',
  GPM: 'S',
  PCCS: 'C',
  ECPS: 'O',
  'CMAFT/NCGES': 'O',
  SPCL: 'C',
};
