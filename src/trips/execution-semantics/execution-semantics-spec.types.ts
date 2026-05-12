/**
 * P-Next 6 — Declarative semantics contract over the physics field space (not executable policy code).
 *
 * Thresholds are normalized where possible so evaluation stays comparable across legs.
 */

export const EXECUTION_SEMANTICS_VERSION = '1.0' as const;

/** Civil dusk / schedule slack interpretation — evaluated against overlay + physics temporal axis. */
export interface TemporalSemantics {
  /** Normalized temporal pressure above which we record soft semantic strain (0–1 scale). */
  softPressureCeiling: number;
  /** Above this, temporal violation degree rises toward 1. */
  hardPressureCeiling: number;
}

export interface MobilitySemantics {
  /** Minimum mobility for non-IMPASSABLE legs before semantic distance accumulates. */
  minMobilityExecutable: number;
}

export interface EnergySemantics {
  /** Minimum normalized energy envelope (fuel axis) before semantic strain. */
  minEnergyReserve: number;
}

export interface ExposureSemantics {
  /** Exposure score above which weather/route coupling is semantically strained. */
  maxExposureComfort: number;
}

/** Unified semantic contract — one object per deployment / product line. */
export interface ExecutionSemanticsSpec {
  semanticsVersion: typeof EXECUTION_SEMANTICS_VERSION;
  temporal: TemporalSemantics;
  mobility: MobilitySemantics;
  energy: EnergySemantics;
  exposure: ExposureSemantics;
}
