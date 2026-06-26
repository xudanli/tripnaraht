/** P5 — Online calibration state for Iceland wind → miss model. */

export const ICELAND_CAUSAL_CALIBRATION_SCHEMA = 'tripnara/iceland-causal-calibration/v1' as const;

export interface IcelandCausalCalibration {
  schema: typeof ICELAND_CAUSAL_CALIBRATION_SCHEMA;
  /** Added to wind speed factor (positive = faster / less conservative) */
  windFactorAdjust: number;
  /** Minutes added to overrun term in miss logistic */
  missLogisticAdjust: number;
  sampleCount: number;
  lastUpdatedAt: string;
}

export function emptyIcelandCalibration(): IcelandCausalCalibration {
  return {
    schema: ICELAND_CAUSAL_CALIBRATION_SCHEMA,
    windFactorAdjust: 0,
    missLogisticAdjust: 0,
    sampleCount: 0,
    lastUpdatedAt: new Date().toISOString(),
  };
}
