/**
 * OFDL runtime — causal transformation programs over Φ (Operator Field DSL).
 *
 * No parser yet: TypeScript IS the surface syntax; this module is the semantic interpreter.
 */

import type { CausalFieldSnapshot, FieldDynamicsConfig } from '../contracts/multi-agent-causal-field.types';
import type { CausalOperatorFieldSpec } from '../contracts/coft-ei.types';
import type { OfdlProjectionMode } from '../contracts/ofdl.types';
import type { UkhfExecDynamicsMode } from '../contracts/ukhf-field.types';
import type { UkhfProjectionMode } from '../contracts/ukhf-field.types';
import type { SpclErrorBundle, SpclObservationSample } from '../contracts/shadow-policy-calibration.types';
import {
  applyCausalOperatorField,
  causalOperatorFieldFromKernel,
} from './coft-ei-operator-field.util';
import { snapshotPhiDelta } from './cognitive-execution-pipeline.util';
import { computeSpclError } from './shadow-policy-calibration.util';

export interface OfdlUkhfResolution {
  ukhfMode: UkhfProjectionMode;
  execDynamics?: UkhfExecDynamicsMode;
}

/**
 * Map DSL modes onto UKHF/COFT slices:
 * - EXEC — nonlinear EXEC branch (message-passing stub).
 * - SHADOW — linear Laplacian shadow (inference).
 * - REACT — same nonlinear EXEC (fast causal response path).
 * - SIMULATE — linear EXEC (cheap deterministic what-if roll).
 */
export function resolveOfdlMode(mode: OfdlProjectionMode): OfdlUkhfResolution {
  switch (mode) {
    case 'EXEC':
      return { ukhfMode: 'EXEC', execDynamics: 'MESSAGE_PASSING_STUB' };
    case 'REACT':
      return { ukhfMode: 'EXEC', execDynamics: 'MESSAGE_PASSING_STUB' };
    case 'SIMULATE':
      return { ukhfMode: 'EXEC', execDynamics: 'LINEAR_LAPLACIAN' };
    case 'SHADOW':
      return { ukhfMode: 'SHADOW' };
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/** 𝒪_{Kθ}[Φ](m) — one OFDL operator application. */
export function applyOfdlOperator(
  field: CausalOperatorFieldSpec,
  phi: CausalFieldSnapshot,
  mode: OfdlProjectionMode,
  config: FieldDynamicsConfig,
): CausalFieldSnapshot {
  const r = resolveOfdlMode(mode);
  return applyCausalOperatorField(field, phi, r.ukhfMode, config, {
    execDynamics: r.execDynamics,
  });
}

export { causalOperatorFieldFromKernel };

/**
 * OFDL “Hello World”: dual projection + ε field (same Kθ).
 *
 *   Φ_exec   = 𝒪(Φ, execMode)
 *   Φ_shadow = 𝒪(Φ, SHADOW)
 *   ε  via SPCL sample (ΔΦ_exec − ΔΦ_shadow in `computeSpclError`).
 */
export function ofdlHelloWorldDualProjection(
  phi: CausalFieldSnapshot,
  field: CausalOperatorFieldSpec,
  config: FieldDynamicsConfig,
  execMode: OfdlProjectionMode = 'EXEC',
): {
  phiExec: CausalFieldSnapshot;
  phiShadow: CausalFieldSnapshot;
  spclSample: SpclObservationSample;
  spclError: SpclErrorBundle;
} {
  const phiExec = applyOfdlOperator(field, phi, execMode, config);
  const phiShadow = applyOfdlOperator(field, phi, 'SHADOW', config);
  const spclSample: SpclObservationSample = {
    deltaPhiExec: snapshotPhiDelta(phi, phiExec),
    deltaPhiShadow: snapshotPhiDelta(phi, phiShadow),
  };
  return {
    phiExec,
    phiShadow,
    spclSample,
    spclError: computeSpclError(spclSample),
  };
}
