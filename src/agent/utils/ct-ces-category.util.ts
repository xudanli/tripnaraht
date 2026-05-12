/**
 * CT-CES — morphisms as OFDL operator applications; composition; square diagrams.
 */

import type { CausalFieldSnapshot, FieldDynamicsConfig } from '../contracts/multi-agent-causal-field.types';
import type { CausalOperatorFieldSpec } from '../contracts/coft-ei.types';
import { CT_CES_DIAGRAM_WITNESS_SCHEMA } from '../contracts/ct-ces.types';
import type { OfdlProjectionMode } from '../contracts/ofdl.types';
import type { SpclObservationSample } from '../contracts/shadow-policy-calibration.types';
import { applyOfdlOperator, ofdlHelloWorldDualProjection } from './ofdl-runtime.util';
import { snapshotPhiRmsDistance } from './gpm-ei-manifold.util';
import { computeSpclError } from './shadow-policy-calibration.util';

/**
 * 𝒪_n ∘ … ∘ 𝒪_1 (Φ) — right-to-left in array order: first element applied first.
 */
export function composeCausalMorphisms(
  field: CausalOperatorFieldSpec,
  phi: CausalFieldSnapshot,
  modeSequence: OfdlProjectionMode[],
  config: FieldDynamicsConfig,
): CausalFieldSnapshot {
  let x = phi;
  for (const m of modeSequence) {
    x = applyOfdlOperator(field, x, m, config);
  }
  return x;
}

/**
 * One-step “pullback square” from shared Φ₀:
 *          Φ_exec ← EXEC morphism
 *          Φ_shadow ← SHADOW morphism
 * Square residual = Φ-RMS(Φ_exec, Φ_shadow) — diagram nearly commutes when small.
 */
export function causalDiagramSquareResidual(
  field: CausalOperatorFieldSpec,
  phi0: CausalFieldSnapshot,
  config: FieldDynamicsConfig,
  execMode: OfdlProjectionMode,
): {
  phiExec: CausalFieldSnapshot;
  phiShadow: CausalFieldSnapshot;
  squareResidualRms: number;
} {
  const phiExec = applyOfdlOperator(field, phi0, execMode, config);
  const phiShadow = applyOfdlOperator(field, phi0, 'SHADOW', config);
  return {
    phiExec,
    phiShadow,
    squareResidualRms: snapshotPhiRmsDistance(phiExec, phiShadow),
  };
}

export interface CausalDiagramWitness {
  schema: typeof CT_CES_DIAGRAM_WITNESS_SCHEMA;
  squareResidualRms: number;
  locallyCommutative: boolean;
  epsilonThreshold: number;
}

/** Replay-style commutativity: threshold τ labels SYSTEM1 vs SYSTEM2 diagram regions. */
export function witnessDiagramCommutativity(
  field: CausalOperatorFieldSpec,
  phi0: CausalFieldSnapshot,
  config: FieldDynamicsConfig,
  execMode: OfdlProjectionMode,
  epsilonThreshold: number,
): CausalDiagramWitness {
  const { squareResidualRms } = causalDiagramSquareResidual(field, phi0, config, execMode);
  return {
    schema: CT_CES_DIAGRAM_WITNESS_SCHEMA,
    squareResidualRms,
    locallyCommutative: squareResidualRms <= epsilonThreshold,
    epsilonThreshold,
  };
}

/**
 * η proxy — paired increments under F_exec vs F_shadow from the same Φ₀ (SPCL sample).
 */
export function naturalTransformationSpclSample(
  field: CausalOperatorFieldSpec,
  phi0: CausalFieldSnapshot,
  config: FieldDynamicsConfig,
  execMode: OfdlProjectionMode = 'EXEC',
): SpclObservationSample {
  return ofdlHelloWorldDualProjection(phi0, field, config, execMode).spclSample;
}

export function naturalTransformationEpsilon(
  sample: SpclObservationSample,
) {
  return computeSpclError(sample);
}
