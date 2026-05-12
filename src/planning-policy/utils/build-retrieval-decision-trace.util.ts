import type { PoiSearchContext } from '../types/poi-search-context.types';
import type { ItineraryGap } from '../types/itinerary-gap.types';
import type { RetrievalCauseEvent } from '../types/retrieval-cause-event.types';
import type { RetrievalDecisionTrace, RetrievalGapStats, RetrievalKind } from '../types/retrieval-decision-trace.types';
import { getPrimarySemanticGap, retrievalReasonFromSemanticGaps } from './detect-itinerary-gaps.util';

const POI_SELECTION_RANKING_TAG =
  'poi_selection:selected_penalty(-1.2_on_draft_place_id)+diversity(same_bucket_count_gt2:-0.25_each)';

/** 有 semanticGaps 时在稳定意图前加 `[gap:TYPE]`，避免 POI_SELECTION 追加说明后主目标被稀释 */
function formatRetrievalReasonWithGapPrefix(gaps: ItineraryGap[], coreReason: string): string {
  if (!gaps.length) return coreReason;
  const p = getPrimarySemanticGap(gaps);
  if (!p) return coreReason;
  if (coreReason.trimStart().startsWith('[gap:')) return coreReason;
  return `[gap:${p.type}] ${coreReason}`;
}

/** 旧 trace 仅有 semanticGaps 而无前缀时补一层（幂等） */
function buildGapStatsFromGaps(gaps: ItineraryGap[]): RetrievalGapStats | undefined {
  if (!gaps.length) return undefined;
  const p = getPrimarySemanticGap(gaps);
  if (!p) return undefined;
  const all = gaps.map((g) => g.type);
  return {
    primaryGap: p.type,
    ...(all.length > 1 ? { allGaps: all } : {}),
  };
}

function ensureGapBracketPrefixOnTrace(trace: RetrievalDecisionTrace): void {
  const gaps = trace.semanticGaps;
  if (!gaps?.length) return;
  const r = trace.retrievalReason ?? '';
  if (r.trimStart().startsWith('[gap:')) return;
  const p = getPrimarySemanticGap(gaps);
  if (!p) return;
  trace.retrievalReason = `[gap:${p.type}] ${r}`;
}

function signalsFromPoiCtx(ctx: PoiSearchContext): RetrievalDecisionTrace['contextualSignals'] {
  const w = ctx.weather?.condition;
  return {
    pacing: ctx.pacing,
    weather: typeof w === 'string' && w.trim() ? w : undefined,
    fatigue: ctx.fatigueScore,
    novelty: ctx.noveltyBias,
  };
}

/** RESEARCH：多路 poi.search 合并后的规划检索轨迹 */
export function buildPlanningRetrievalDecisionTrace(args: {
  poiSearchCtx: PoiSearchContext;
  scenicQuery: string;
  generalQuery: string;
  extraSubQueries?: Record<string, string>;
  mergedPoiCount: number;
  /** 规则检测语义缺口；有则驱动 `retrievalReason` 并写入 `semanticGaps` */
  semanticGaps?: ItineraryGap[];
  retrievalReason?: string;
}): RetrievalDecisionTrace {
  const q = `${args.scenicQuery} || ${args.generalQuery}`;
  const gaps = args.semanticGaps ?? [];
  const fromGap = retrievalReasonFromSemanticGaps(gaps);
  const coreReason = fromGap ?? args.retrievalReason ?? 'research:poi.search_multi_leg_merge';
  const gapStats = buildGapStatsFromGaps(gaps);
  return {
    retrievalKind: 'planning',
    query: q.length > 900 ? `${q.slice(0, 897)}...` : q,
    subQueries: {
      scenic: args.scenicQuery,
      general: args.generalQuery,
      ...(args.extraSubQueries ?? {}),
    },
    contextualSignals: signalsFromPoiCtx(args.poiSearchCtx),
    penalties: {
      rejected: [...(args.poiSearchCtx.rejectedPoiIds ?? [])],
      selected: [...(args.poiSearchCtx.selectedPoiIds ?? [])],
      diversity: ['deferred:poi_selection_batch_penalty'],
    },
    ...(gaps.length ? { semanticGaps: gaps } : {}),
    ...(gapStats ? { gapStats } : {}),
    retrievalReason: formatRetrievalReasonWithGapPrefix(gaps, coreReason),
    ts: new Date().toISOString(),
    mergedPoiCount: args.mergedPoiCount,
  };
}

/** VERIFY/REPAIR：闭馆等突变后的替代检索（仍走 poi.search，但与 planning 分层） */
export function buildReplacementRetrievalDecisionTrace(args: {
  poiSearchCtx: PoiSearchContext;
  query: string;
  hardRejectedIds: string[];
  mergedPoiCount: number;
  /** 本次检索意图/策略（与 `causedByEvent` 严格区分） */
  retrievalReason?: string;
  /** 仅 replacement：世界事件 → retrieval 因果边 */
  causedByEvent?: RetrievalCauseEvent;
  semanticGaps?: ItineraryGap[];
}): RetrievalDecisionTrace {
  const gaps = args.semanticGaps ?? [];
  const fromGap = retrievalReasonFromSemanticGaps(gaps);
  const coreReason =
    fromGap ?? args.retrievalReason ?? 'find_alternative_poi_same_category_near_closed_slot';
  const gapStats = buildGapStatsFromGaps(gaps);
  return {
    retrievalKind: 'replacement',
    query: args.query,
    contextualSignals: signalsFromPoiCtx(args.poiSearchCtx),
    penalties: {
      rejected: [...new Set(args.hardRejectedIds.map((x) => String(x).trim().toLowerCase()).filter(Boolean))],
      selected: [...(args.poiSearchCtx.selectedPoiIds ?? [])],
      diversity: [],
    },
    causedByEvent: args.causedByEvent,
    ...(gaps.length ? { semanticGaps: gaps } : {}),
    ...(gapStats ? { gapStats } : {}),
    retrievalReason: formatRetrievalReasonWithGapPrefix(gaps, coreReason),
    ts: new Date().toISOString(),
    mergedPoiCount: args.mergedPoiCount,
  };
}

/** 失败或短路时写入最小轨迹，避免「完全黑盒」 */
export function buildFailedRetrievalTrace(args: {
  kind: RetrievalKind;
  message: string;
  poiSearchCtx?: PoiSearchContext;
}): RetrievalDecisionTrace {
  const sig = args.poiSearchCtx ? signalsFromPoiCtx(args.poiSearchCtx) : {};
  return {
    retrievalKind: args.kind,
    query: '',
    contextualSignals: sig,
    penalties: {
      rejected: [...(args.poiSearchCtx?.rejectedPoiIds ?? [])],
      selected: [...(args.poiSearchCtx?.selectedPoiIds ?? [])],
      diversity: [],
    },
    retrievalReason: args.message,
    ts: new Date().toISOString(),
    mergedPoiCount: 0,
  };
}

/** POI_SELECTION 之后：补充 ranking 因果（不改变 rejected/selected id 列表语义） */
export function annotateRetrievalTraceAfterPoiSelection(trace: RetrievalDecisionTrace | null | undefined): void {
  if (!trace?.penalties) return;
  ensureGapBracketPrefixOnTrace(trace);
  const prev = trace.retrievalReason ?? '';
  if (prev.includes(POI_SELECTION_RANKING_TAG)) return;
  trace.retrievalReason = prev ? `${prev}; ${POI_SELECTION_RANKING_TAG}` : POI_SELECTION_RANKING_TAG;
  trace.penalties.diversity = [
    ...trace.penalties.diversity.filter((x) => !String(x).startsWith('deferred:')),
    'applied:applySelectedPoiPenalty',
    'applied:applyDiversityPenaltyToSortedRows',
  ];
}
