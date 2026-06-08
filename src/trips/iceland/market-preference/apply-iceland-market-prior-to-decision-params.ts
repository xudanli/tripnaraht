// src/trips/iceland/market-preference/apply-iceland-market-prior-to-decision-params.ts

import type { DecisionParams } from '../../../agent/memory/interfaces/decision-params.interface';
import { loadIcelandMarketPreferenceMatrix } from './load-iceland-market-preference-matrix';
import { getIcelandMarketApplyStrength } from './resolve-iceland-market-segment';
import type { IcelandMarketSegmentId, IcelandMarketSegmentResolution } from './iceland-market-preference.types';

function applyBiasDelta(
  target: DecisionParams['routeDirectionBias'],
  delta: Partial<DecisionParams['routeDirectionBias']> | undefined,
  strength: number,
): void {
  if (!delta) return;
  for (const key of Object.keys(delta) as (keyof DecisionParams['routeDirectionBias'])[]) {
    const d = delta[key];
    if (typeof d === 'number') {
      target[key] = Math.max(0, Math.min(1, target[key] + d * strength));
    }
  }
}

function applyStrategyDelta(
  target: DecisionParams['strategyPreference'],
  delta: Partial<DecisionParams['strategyPreference']> | undefined,
  strength: number,
): void {
  if (!delta) return;
  for (const key of Object.keys(delta) as (keyof DecisionParams['strategyPreference'])[]) {
    const d = delta[key];
    if (typeof d === 'number') {
      target[key] = Math.max(0, target[key] + d * strength);
    }
  }
}

/**
 * 将市场矩阵 Δ 叠加到 DecisionParams（原地修改）。
 */
export function applyIcelandMarketPriorToDecisionParams(
  params: DecisionParams,
  resolution: IcelandMarketSegmentResolution,
): void {
  const matrix = loadIcelandMarketPreferenceMatrix();
  const strength = getIcelandMarketApplyStrength(resolution.confidence, matrix);
  if (strength <= 0) return;

  const delta = matrix.segments[resolution.segmentId as IcelandMarketSegmentId].decision_params_delta;
  applyBiasDelta(params.routeDirectionBias, delta.routeDirectionBias, strength);
  applyStrategyDelta(params.strategyPreference, delta.strategyPreference, strength);

  if (delta.constraints) {
    if (delta.constraints.maxDailyAscentM != null) {
      const base = params.constraints.maxDailyAscentM ?? 1000;
      params.constraints.maxDailyAscentM = Math.round(
        base + (delta.constraints.maxDailyAscentM - base) * strength,
      );
    }
    if (delta.constraints.maxSlopePct != null) {
      const base = params.constraints.maxSlopePct ?? 25;
      params.constraints.maxSlopePct = base + (delta.constraints.maxSlopePct - base) * strength;
    }
    if (delta.constraints.bufferTimeMin != null) {
      const base = params.constraints.bufferTimeMin ?? 15;
      params.constraints.bufferTimeMin = Math.round(
        base + delta.constraints.bufferTimeMin * strength,
      );
    }
  }

  if (delta.repairPolicy) {
    if (delta.repairPolicy.preferRestDay && strength >= 0.5) {
      params.repairPolicy.preferRestDay = true;
    }
    if (delta.repairPolicy.preferAltRoute && strength >= 0.5) {
      params.repairPolicy.preferAltRoute = true;
    }
    if (delta.repairPolicy.preferSplitDays === false && strength >= 0.7) {
      params.repairPolicy.preferSplitDays = false;
    }
  }
}

/**
 * RouteDirection 标签与市场矩阵亲和度 → 评分乘子（供 adjustRouteDirectionScore 使用）。
 */
export function getIcelandMarketRouteTagScoreMultiplier(
  routeTags: string[],
  resolution: IcelandMarketSegmentResolution | null | undefined,
): number {
  if (!resolution?.routeDirectionTagAffinities || routeTags.length === 0) return 1;
  const aff = resolution.routeDirectionTagAffinities;
  let best = 0;
  for (const tag of routeTags) {
    const t = tag.toLowerCase();
    for (const [k, v] of Object.entries(aff)) {
      if (t.includes(k.toLowerCase()) || k.toLowerCase().includes(t)) {
        best = Math.max(best, v);
      }
    }
  }
  if (best <= 0) return 1;
  const strength = getIcelandMarketApplyStrength(resolution.confidence);
  return 1 + (best - 0.5) * 0.25 * strength;
}
