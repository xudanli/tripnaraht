/**
 * PLAN draft TDFPM fatigue（从 ClaudeOrchestrator 迁出）。
 */

import type { ComputePlanDraftFatigueHost } from './compute-plan-draft-fatigue.host';
import type { Itinerary } from '../interfaces/trip-plan.interface';

export function computePlanDraftFatigue(
  host: ComputePlanDraftFatigueHost,
  planDraft: Itinerary | undefined,
): number | undefined {
  if (!planDraft?.days?.length || !host.tdfpmCalculator) return undefined;
  try {
    const contexts = host.itineraryToTdfpmDayContexts(planDraft);
    const scores = contexts.map((ctx) => host.tdfpmCalculator!.computeFatigueScore(ctx).fatigueScore);
    const maxScore = Math.max(...scores, 0);
    const fatigue = Math.min(1, maxScore / 100);
    host.logger.debug(
      `[Claude Orchestrator] TDFPM fatigue: maxScore=${maxScore}, fatigue=${fatigue.toFixed(2)}`,
    );
    return fatigue;
  } catch (e: any) {
    host.logger.warn(`[Claude Orchestrator] TDFPM 计算失败: ${e?.message}`);
    return undefined;
  }
}
