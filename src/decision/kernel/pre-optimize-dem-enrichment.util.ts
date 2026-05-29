/**
 * PR-4 — OPTIMIZE 前统一 DEM / 地形审计入口（Kernel SSOT 与 Legacy 共享契约）。
 */

import type { RoutePlanDraft } from '../../trips/decision/shared/world-model.types';
import type { StateConsistencyGuardService } from '../../trips/dem/services/state-consistency-guard.service';

export interface PreOptimizeDemEnrichmentResult {
  plan: RoutePlanDraft;
  patched: boolean;
  source: 'state_consistency_guard' | 'passthrough';
}

/**
 * Kernel OPTIMIZE / Legacy repair 前应调用：按需 Shadow Elevation 回填 ascentM/slopePct。
 */
export async function enrichRoutePlanForOptimize(
  plan: RoutePlanDraft,
  guard?: Pick<StateConsistencyGuardService, 'enrichRoutePlanDraftIfNeeded'>,
): Promise<PreOptimizeDemEnrichmentResult> {
  if (!guard) {
    return { plan, patched: false, source: 'passthrough' };
  }
  const { plan: enriched, patched } = await guard.enrichRoutePlanDraftIfNeeded(plan);
  return { plan: enriched, patched, source: 'state_consistency_guard' };
}
