/**
 * Iceland self-drive causal engine — composable domain module (P2).
 *
 * Wires wind exposure → effective speed → ETA P90 → appointment miss probability.
 */

import type {
  IcelandSelfDriveCausalInput,
  IcelandSelfDriveCausalOutput,
  IcelandTravelTimeDistribution,
  IcelandWindExposure,
} from './iceland-self-drive-causal.types';
import { ICELAND_SELF_DRIVE_CAUSAL_SCHEMA } from './iceland-self-drive-causal.types';
import type { IcelandCausalCalibration } from './iceland-causal-calibration.types';
import { formatIcelandSelfDriveAssessment } from './iceland-self-drive-narrative.util';

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function exposureWindMultiplier(exposure: IcelandWindExposure): number {
  switch (exposure) {
    case 'high':
      return 1.12;
    case 'medium':
      return 1.05;
    default:
      return 1;
  }
}

/** Wind reduces safe driving speed — monotonic, auditable. */
export function windToSpeedFactor(
  windMps: number,
  exposure: IcelandWindExposure = 'medium',
  calibration?: { windFactorAdjust?: number },
): number {
  const gustBoost = 0;
  const effectiveWind = windMps + gustBoost;
  const base = 1 - (effectiveWind / 35) * 0.42;
  const adjust = calibration?.windFactorAdjust ?? 0;
  const factored = base / exposureWindMultiplier(exposure) + adjust;
  return Math.max(0.52, Math.min(1, factored));
}

export function computeTravelTimeDistribution(input: {
  baseDurationMinutes: number;
  distanceKm: number;
  windMps: number;
  windExposure?: IcelandWindExposure;
  calibration?: { windFactorAdjust?: number };
}): IcelandTravelTimeDistribution {
  const exposure = input.windExposure ?? 'medium';
  const windSpeedFactor = windToSpeedFactor(input.windMps, exposure, input.calibration);
  const pointMinutes = Math.max(5, Math.round(input.baseDurationMinutes / windSpeedFactor));
  const uncertaintySpread = Math.min(0.38, 0.12 + input.windMps / 45);
  const p10Minutes = Math.max(1, Math.round(pointMinutes * (1 - uncertaintySpread * 0.35)));
  const p90Minutes = Math.max(p10Minutes + 5, Math.round(pointMinutes * (1 + uncertaintySpread)));
  const effectiveSpeedKmh =
    input.distanceKm > 0 ? (input.distanceKm / pointMinutes) * 60 : 0;

  return {
    pointMinutes,
    p10Minutes,
    p90Minutes,
    effectiveSpeedKmh: Math.round(effectiveSpeedKmh * 10) / 10,
    windSpeedFactor: Math.round(windSpeedFactor * 1000) / 1000,
  };
}

/** Miss probability from plan slack vs P90 overrun (auditable). */
export function slackToMissProbability(
  slackMinutes: number,
  p90TravelMinutes: number,
  plannedTravelMinutes?: number,
  calibration?: { missLogisticAdjust?: number },
): number {
  const planned = plannedTravelMinutes ?? Math.round(p90TravelMinutes * 0.88);
  const adjust = calibration?.missLogisticAdjust ?? 0;
  const overrun = p90TravelMinutes - planned - slackMinutes + adjust;
  const logistic = 1 / (1 + Math.exp(-overrun / 12));
  return clamp01(logistic * 0.9);
}

export function recommendShiftMinutes(
  input: IcelandSelfDriveCausalInput,
  travel: IcelandTravelTimeDistribution,
  targetMissProb = 0.18,
): { shiftMinutes: number; rationale: string } | undefined {
  const currentMiss = slackToMissProbability(input.appointmentSlackMinutes, travel.p90Minutes);
  if (currentMiss <= targetMissProb) return undefined;

  for (const shift of [20, 30, 40, 50, 60, 75, 90]) {
    const after = slackToMissProbability(input.appointmentSlackMinutes + shift, travel.p90Minutes);
    if (after <= targetMissProb) {
      return {
        shiftMinutes: shift,
        rationale: `提前 ${shift} 分钟可将错过概率从 ${Math.round(currentMiss * 100)}% 降至约 ${Math.round(after * 100)}%`,
      };
    }
  }
  return {
    shiftMinutes: 50,
    rationale: `建议至少提前 50 分钟；当前错过概率约 ${Math.round(currentMiss * 100)}%`,
  };
}

export function runIcelandSelfDriveCausalAnalysis(
  input: IcelandSelfDriveCausalInput,
  calibration?: Pick<IcelandCausalCalibration, 'windFactorAdjust' | 'missLogisticAdjust'>,
): IcelandSelfDriveCausalOutput {
  const travelTime = computeTravelTimeDistribution({
    baseDurationMinutes: input.baseDurationMinutes,
    distanceKm: input.distanceKm,
    windMps: input.windMps,
    windExposure: input.windExposure,
    calibration,
  });

  const missProbability = slackToMissProbability(
    input.appointmentSlackMinutes,
    travelTime.p90Minutes,
    input.baseDurationMinutes,
    calibration,
  );

  let missProbabilityAfterShift: number | undefined;
  if (input.shiftMinutes && input.shiftMinutes > 0) {
    missProbabilityAfterShift = slackToMissProbability(
      input.appointmentSlackMinutes + input.shiftMinutes,
      travelTime.p90Minutes,
      input.baseDurationMinutes,
      calibration,
    );
  }

  const recommended = recommendShiftMinutes(input, travelTime);

  const causalChain = [
    'environment:wind_mps',
    'physics:safe_speed_factor',
    'travel:duration_p90',
    'temporal:appointment_slack',
    'outcome:miss_probability',
  ];

  const bindings = [
    {
      variable: 'environment:wind_mps',
      label: '阵风/10m 风速',
      baseValue: input.windMps,
      projectedValue: input.windMps,
      unit: 'm/s',
    },
    {
      variable: 'physics:safe_speed_factor',
      label: '风速折减后安全速度系数',
      baseValue: 1,
      projectedValue: travelTime.windSpeedFactor,
      unit: 'ratio',
    },
    {
      variable: 'travel:duration_p90',
      label: 'P90 行驶时间',
      baseValue: input.baseDurationMinutes,
      projectedValue: travelTime.p90Minutes,
      unit: 'minutes',
    },
    {
      variable: 'outcome:miss_probability',
      label: '错过集合/预约概率',
      baseValue: missProbability,
      projectedValue: missProbabilityAfterShift ?? missProbability,
      unit: 'ratio',
    },
  ];

  const userFacingAssessment = formatIcelandSelfDriveAssessment({
    routeLabel: input.routeLabel,
    windMps: input.windMps,
    windWindowLabel: input.region ? `${input.region} 路段` : undefined,
    baseDurationMinutes: input.baseDurationMinutes,
    p90Minutes: travelTime.p90Minutes,
    missProbability,
    missProbabilityAfterShift,
    shiftMinutes: input.shiftMinutes ?? recommended?.shiftMinutes,
    recommendedRationale: recommended?.rationale,
  });

  return {
    schema: ICELAND_SELF_DRIVE_CAUSAL_SCHEMA,
    input,
    travelTime,
    missProbability,
    missProbabilityAfterShift,
    causalChain,
    bindings,
    userFacingAssessment,
    recommendedIntervention: recommended
      ? { type: 'SHIFT_TIME', shiftMinutes: recommended.shiftMinutes, rationale: recommended.rationale }
      : undefined,
  };
}
