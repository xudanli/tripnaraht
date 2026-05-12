/**
 * 显式加权效用（非 ML）：机会 vs 扰动的统一货币。
 *
 * tradeoffScore =
 *   + opportunityGain * W_GAIN
 *   - driveCost * W_DRIVE
 *   - lodgingCost * W_LODGING
 *   - downstreamImpact * W_DOWNSTREAM
 */

import type {
  OpportunityTradeoffInput,
  OpportunityTradeoffResult,
} from './opportunity-tradeoff.types';

const W_GAIN = 0.45;
const W_DRIVE = 0.2;
const W_LODGING = 0.2;
const W_DOWNSTREAM = 0.15;

/** 驾驶分钟 → [0,1] 成本（约 4h 饱和） */
const DRIVE_SATURATION_MIN = 240;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function driveCostNormalized(minutes: number): number {
  return clamp01(Math.max(0, minutes) / DRIVE_SATURATION_MIN);
}

/**
 * 原始分大致落在 [-0.55, 0.45]；映射到 [0,1] 后与策略归一化阈值（如 casual 0.75）比较。
 */
export function normalizeTradeoffScore01(raw: number): number {
  return clamp01(raw + 0.55);
}

/**
 * @param migrationThresholdNormalized — `migrationNormalizedThreshold(stance)`，0–1；normalizedScore > threshold ⇒ MIGRATE
 */
export function computeOpportunityTradeoff(
  input: OpportunityTradeoffInput,
  migrationThresholdNormalized: number,
): OpportunityTradeoffResult {
  const g = clamp01(input.opportunityGain);
  const d = driveCostNormalized(input.driveDeltaMinutes);
  const l = clamp01(input.lodgingDisruptionCost);
  const x = clamp01(input.downstreamPlanImpactScore);

  const tradeoffScore =
    W_GAIN * g - W_DRIVE * d - W_LODGING * l - W_DOWNSTREAM * x;

  const normalizedScore = normalizeTradeoffScore01(tradeoffScore);

  const rationale: string[] = [
    `raw=${tradeoffScore.toFixed(3)} → normalized=${normalizedScore.toFixed(3)} (gain ${W_GAIN}×${g.toFixed(3)} − drive ${W_DRIVE}×${d.toFixed(3)} − lodging ${W_LODGING}×${l.toFixed(3)} − ripple ${W_DOWNSTREAM}×${x.toFixed(3)})`,
    `normalizedThreshold=${migrationThresholdNormalized.toFixed(3)} ⇒ ${normalizedScore > migrationThresholdNormalized ? 'MIGRATE' : 'STAY'}`,
  ];

  const confidence = clamp01(
    0.42 + 0.58 * (1 - Math.min(d, l, x)) * (0.5 + 0.5 * Math.abs(normalizedScore - 0.5)),
  );

  return {
    tradeoffScore,
    recommendation:
      normalizedScore > migrationThresholdNormalized ? 'MIGRATE' : 'STAY',
    confidence,
    rationale,
  };
}
