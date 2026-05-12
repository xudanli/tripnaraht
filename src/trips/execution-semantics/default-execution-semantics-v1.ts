/**
 * P-Next 6 — Default semantic profile (conservative, explainable).
 */

import type { ExecutionSemanticsSpec } from './execution-semantics-spec.types';
import { EXECUTION_SEMANTICS_VERSION } from './execution-semantics-spec.types';

export const SEMANTICS_PROFILE_DEFAULT_V1 = 'default-v1' as const;

export const DEFAULT_EXECUTION_SEMANTICS_V1: ExecutionSemanticsSpec = {
  semanticsVersion: EXECUTION_SEMANTICS_VERSION,
  temporal: {
    softPressureCeiling: 0.45,
    hardPressureCeiling: 0.82,
  },
  mobility: {
    minMobilityExecutable: 0.35,
  },
  energy: {
    minEnergyReserve: 0.18,
  },
  exposure: {
    maxExposureComfort: 0.72,
  },
};
