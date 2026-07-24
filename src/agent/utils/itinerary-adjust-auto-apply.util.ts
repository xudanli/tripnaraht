/**
 * ITINERARY_ADJUST 自动落库：强修改意图 × 走廊高置信度双闸门。
 */

import type { CorridorFallbackLevel } from './itinerary-adjust-corridor-fallback.util';
import type { CorridorFilterStats } from './itinerary-adjust-corridor-fallback.util';
import { detectPoiSlotFillIntent } from './itinerary-adjust-poi-slot-fill.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';
import {
  buildAutoCorridorUiFlagsV1,
  type AutoCorridorUiFlagsV1,
} from '../contracts/auto-corridor-product.contract';

export type ItineraryAdjustSubIntent = 'exploratory' | 'strong_modification' | 'poi_slot_fill';

export type ItineraryAdjustExecutionMode = 'AUTO' | 'SEMI_AUTO' | 'ADVICE_ONLY';

export const HIGH_CONFIDENCE_CORRIDOR_FALLBACK_LEVELS: readonly CorridorFallbackLevel[] = [
  'baseline_50km',
  'expanded_80km',
];

const EXPLORATORY_PATTERNS: RegExp[] = [
  /有什么推荐/,
  /还能去哪/,
  /有哪些?(?:选择|方案|去处|地方)/,
  /如果.{0,12}(?:改成|改为|不去).{0,16}(?:有什么|哪些|推荐)/,
  /(?:推荐|建议).{0,8}(?:吗|？|\?)/,
  /(?:看看|了解).{0,8}(?:有什么|哪些).{0,8}(?:推荐|建议)/,
];

const STRONG_MODIFICATION_PATTERNS: RegExp[] = [
  /重新规划/,
  /直接重排/,
  /明显不合理/,
  /帮(?:我|您).{0,20}(?:改|调整|重排|重新规划|更新)/,
  /把.{0,32}(?:改成|改为|调整|重排|换掉)/,
  /(?:就|请).{0,8}(?:改|调整|重排|更新).{0,12}(?:行程|第二天|第\s*\d+\s*天)/,
  /应用到(?:正式)?行程/,
  /落库/,
];

export function classifyItineraryAdjustSubIntent(message: string): ItineraryAdjustSubIntent {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (!t.trim()) return 'exploratory';

  if (detectPoiSlotFillIntent(t)) return 'poi_slot_fill';

  const exploratory = EXPLORATORY_PATTERNS.some((re) => re.test(t));
  const strong = STRONG_MODIFICATION_PATTERNS.some((re) => re.test(t));

  if (strong && !exploratory) return 'strong_modification';
  if (exploratory && !strong) return 'exploratory';
  if (strong) return 'strong_modification';
  if (/(?:重新规划|重排|改写|更新行程)/.test(t)) return 'strong_modification';
  return 'exploratory';
}

export type ItineraryAdjustConfidenceGateResult = {
  highConfidence: boolean;
  reasons: string[];
  fallbackLevel?: string;
  lastTierStats?: CorridorFilterStats;
};

export function evaluateItineraryAdjustConfidenceGate(
  metadata: Record<string, unknown>,
): ItineraryAdjustConfidenceGateResult {
  const reasons: string[] = [];
  const fallbackLevel = metadata.itinerary_adjust_corridor_fallback_level as
    | CorridorFallbackLevel
    | undefined;
  const diagnostics = metadata.itinerary_adjust_corridor_fallback as
    | {
        tierAttempts?: CorridorFilterStats[];
        poiSearchSupplementCount?: number;
      }
    | undefined;

  const tierAttempts = diagnostics?.tierAttempts ?? [];
  const lastTierStats =
    tierAttempts.length > 0 ? tierAttempts[tierAttempts.length - 1] : undefined;

  let highConfidence = true;

  if (!fallbackLevel || !HIGH_CONFIDENCE_CORRIDOR_FALLBACK_LEVELS.includes(fallbackLevel)) {
    highConfidence = false;
    reasons.push(`fallback_level:${fallbackLevel ?? 'missing'}`);
  }

  if ((diagnostics?.poiSearchSupplementCount ?? 0) > 0) {
    highConfidence = false;
    reasons.push('poi_search_supplement');
  }

  if (metadata.itinerary_adjust_corridor_poi_search) {
    highConfidence = false;
    reasons.push('corridor_poi_search_triggered');
  }

  if (lastTierStats && lastTierStats.inputCount > 0) {
    const pruned =
      lastTierStats.droppedOutlier + lastTierStats.droppedGoldenCircle + lastTierStats.noCoords;
    const pruneRate = pruned / lastTierStats.inputCount;
    if (pruneRate > 0.42) {
      highConfidence = false;
      reasons.push(`prune_rate_high:${pruneRate.toFixed(2)}`);
    }
    if (lastTierStats.droppedGoldenCircle >= 2 && lastTierStats.matched < 4) {
      highConfidence = false;
      reasons.push('golden_circle_prune_heavy');
    }
  }

  return {
    highConfidence,
    reasons,
    fallbackLevel,
    lastTierStats,
  };
}

export function resolveItineraryAdjustExecutionMode(params: {
  subIntent: ItineraryAdjustSubIntent;
  highConfidence: boolean;
  /** POI_SLOT_FILL：全部新增项已绑定 place_id 时可 SEMI_AUTO 追加落库 */
  poiSlotFillReady?: boolean;
}): ItineraryAdjustExecutionMode {
  if (params.subIntent === 'poi_slot_fill' && params.poiSlotFillReady) {
    return 'SEMI_AUTO';
  }
  if (params.subIntent === 'strong_modification' && params.highConfidence) {
    return 'AUTO';
  }
  return 'ADVICE_ONLY';
}

export function buildItineraryAdjustAutoApplyLeadMessage(params: {
  applied: boolean;
  executionMode: ItineraryAdjustExecutionMode;
  targetDateIso?: string;
  dayNumber?: number;
}): string | undefined {
  const dayLabel =
    params.dayNumber != null
      ? `第 ${params.dayNumber} 天`
      : params.targetDateIso
        ? params.targetDateIso
        : '目标日';
  if (params.applied && params.executionMode === 'AUTO') {
    return `已为你重新规划并更新${dayLabel}行程。`;
  }
  if (params.applied && params.executionMode === 'SEMI_AUTO') {
    return `已根据你的行程向空档日追加了推荐景点，左侧时间轴已同步。`;
  }
  if (params.executionMode === 'ADVICE_ONLY') {
    return `已为你生成${dayLabel}的优化草案，确认后可在工作台应用至正式行程。`;
  }
  return undefined;
}

export function buildItineraryAdjustActionExecutionPayload(metadata: Record<string, unknown>): {
  mode: ItineraryAdjustExecutionMode;
  status: 'SUCCEEDED' | 'NOT_STARTED' | 'PENDING_CONFIRM';
  requires_confirmation_count: number;
  itinerary_adjust_auto_apply?: unknown;
  /** P1-4：AUTO 走廊产品 UI / 审计提示 */
  auto_corridor_ui_v1?: AutoCorridorUiFlagsV1;
} {
  const mode =
    (metadata.itinerary_adjust_execution_mode as ItineraryAdjustExecutionMode | undefined) ??
    'ADVICE_ONLY';
  const autoApply = metadata.itinerary_adjust_auto_apply as { applied?: boolean } | undefined;
  const applied =
    autoApply?.applied === true && (mode === 'AUTO' || mode === 'SEMI_AUTO');

  return {
    mode,
    status: applied
      ? 'SUCCEEDED'
      : mode === 'AUTO'
        ? 'PENDING_CONFIRM'
        : mode === 'SEMI_AUTO'
          ? 'PENDING_CONFIRM'
          : 'NOT_STARTED',
    requires_confirmation_count: applied ? 0 : mode === 'ADVICE_ONLY' ? 0 : 1,
    itinerary_adjust_auto_apply: autoApply,
    auto_corridor_ui_v1: buildAutoCorridorUiFlagsV1({ metadata, executionMode: mode }),
  };
}
