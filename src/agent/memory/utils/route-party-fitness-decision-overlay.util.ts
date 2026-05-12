import type { DecisionParams } from '../interfaces/decision-params.interface';

/**
 * 将 route_and_run 的 `routePartyProfile.fitness_level` 合并进 DecisionParams。
 * 不修改 maxElevationM（仍由 UserTravelProfile.altitudeTolerance 等主导），主要调 DEM/节奏相关 soft 约束与修复倾向。
 */
export function applyRoutePartyFitnessToDecisionParams(
  params: DecisionParams,
  fitness: 'low' | 'medium' | 'high',
): void {
  const c = params.constraints;
  switch (fitness) {
    case 'low': {
      if (c.maxDailyAscentM != null) c.maxDailyAscentM = Math.min(c.maxDailyAscentM, 480);
      else c.maxDailyAscentM = 480;
      if (c.maxSlopePct != null) c.maxSlopePct = Math.min(c.maxSlopePct, 20);
      else c.maxSlopePct = 20;
      c.bufferTimeMin = Math.max(c.bufferTimeMin ?? 15, 36);
      c.avoidRapidAscent = true;
      params.repairPolicy.preferRestDay = true;
      params.repairPolicy.preferSplitDays = true;
      params.strategyPreference.abuWeight += 0.1;
      break;
    }
    case 'medium': {
      c.bufferTimeMin = Math.max(c.bufferTimeMin ?? 15, 24);
      if (c.maxDailyAscentM != null) c.maxDailyAscentM = Math.min(c.maxDailyAscentM, 820);
      else c.maxDailyAscentM = 780;
      break;
    }
    case 'high': {
      c.bufferTimeMin = Math.max(10, (c.bufferTimeMin ?? 15) - 8);
      params.routeDirectionBias.difficultyWeight += 0.06;
      params.routeDirectionBias.stabilityWeight = Math.max(0.08, params.routeDirectionBias.stabilityWeight - 0.05);
      if (c.maxDailyAscentM != null && c.maxDailyAscentM >= 820) {
        c.maxDailyAscentM = Math.min(1700, Math.floor(c.maxDailyAscentM * 1.1));
      } else if (c.maxDailyAscentM == null) {
        c.maxDailyAscentM = 1150;
      }
      params.strategyPreference.drDreWeight += 0.06;
      break;
    }
    default:
      break;
  }
}
