/**
 * ITINERARY_ADJUST：决策日志 K3 摘要与 NARRATE/VERIFY 作用域裁剪。
 */

import type { DecisionLogEntry, OrchestratorState } from '../interfaces/trip-plan.interface';
import type { RouteAndRunIntentAnalysis } from './route-and-run-intent-analyzer.util';
import { classifyItineraryAdjustSubIntent } from './itinerary-adjust-auto-apply.util';
import {
  buildItineraryAdjustOptimizationResult,
  type ItineraryAdjustOptimizationResult,
  type ItineraryAdjustScheduleItem,
} from './itinerary-adjust-optimization-summary.util';
import type { NeighborAnchorContext, TripDayAnchorRow } from './itinerary-adjust-neighbor-anchors.util';
import type { CorridorFallbackLevel } from './itinerary-adjust-corridor-fallback.util';
import {
  parsePoiNameFromVerifyDetail,
  poiNameMatchesDraftSchedule,
} from './filter-stale-verify-violations.util';
import { applyPacingRelaxToAdjustTargetState } from '../../skills/itinerary/experience-curator-pacing-relax.util';
import { formatClockLabelOptional } from '../../common/utils/format-clock-label.util';

export type ItineraryAdjustRunContext = {
  active: boolean;
  targetDateIso?: string;
  targetDayNumber?: number;
  subIntent?: string;
  metadata: Record<string, unknown>;
};

const FALLBACK_LEVEL_LOG_ZH: Partial<Record<CorridorFallbackLevel, string>> = {
  baseline_50km: '标准走廊约50km',
  expanded_80km: '走廊放宽至约80km',
  expanded_120km: '走廊放宽至约120km',
  anchor_radius_35km: '锚点半径35km补检',
  anchor_radius_55km: '锚点半径55km补检',
  best_effort_sparse: '稀疏区尽力匹配',
};

export function resolveItineraryAdjustRunContext(state: OrchestratorState): ItineraryAdjustRunContext {
  const metadata = (state.metadata ?? {}) as Record<string, unknown>;
  const routeIntent = metadata.route_and_run_intent as RouteAndRunIntentAnalysis | undefined;
  const active =
    metadata.itinerary_adjust_intake === true || routeIntent?.primary === 'ITINERARY_ADJUST';
  if (!active) {
    return { active: false, metadata };
  }

  const targetDateIso =
    (typeof metadata.itinerary_adjust_target_date_iso === 'string'
      ? metadata.itinerary_adjust_target_date_iso.slice(0, 10)
      : undefined) ?? undefined;

  const anchors = metadata.itinerary_adjust_neighbor_anchors as NeighborAnchorContext | undefined;
  const targetDayNumber =
    anchors?.targetDayNumber ??
    (typeof metadata.itinerary_adjust_target_day_number === 'number'
      ? metadata.itinerary_adjust_target_day_number
      : undefined);

  const intakeMsg =
    (typeof metadata.intake_user_message === 'string' ? metadata.intake_user_message : '') ||
    state.trip_plan_request?.message ||
    '';

  return {
    active: true,
    targetDateIso,
    targetDayNumber,
    subIntent: classifyItineraryAdjustSubIntent(intakeMsg),
    metadata,
  };
}

export function buildItineraryAdjustAuditMetadata(
  metadata: Record<string, unknown>,
  extras?: Record<string, unknown>,
): Record<string, unknown> {
  const anchors = metadata.itinerary_adjust_neighbor_anchors as NeighborAnchorContext | undefined;
  const level = metadata.itinerary_adjust_corridor_fallback_level as CorridorFallbackLevel | undefined;
  const diagnostics = metadata.itinerary_adjust_corridor_fallback as
    | { tierAttempts?: Array<{ matched?: number; droppedGoldenCircle?: number }> }
    | undefined;
  const lastTier = diagnostics?.tierAttempts?.slice(-1)?.[0];

  return {
    itinerary_adjust_audit: {
      target_date_iso: metadata.itinerary_adjust_target_date_iso,
      target_day_number: anchors?.targetDayNumber,
      sub_intent: metadata.itinerary_adjust_sub_intent,
      execution_mode: metadata.itinerary_adjust_execution_mode,
      corridor_fallback_level: level,
      corridor_fallback_zh: level ? FALLBACK_LEVEL_LOG_ZH[level] : undefined,
      corridor_selection: metadata.itinerary_adjust_corridor_selection === true,
      neighbor_start_source: anchors?.startAnchorSource,
      neighbor_end_source: anchors?.endAnchorSource,
      matched_candidates: lastTier?.matched,
      dropped_golden_circle: lastTier?.droppedGoldenCircle,
      poi_search: metadata.itinerary_adjust_corridor_poi_search,
      auto_apply: metadata.itinerary_adjust_auto_apply,
      ...extras,
    },
  };
}

export function formatItineraryAdjustIntakeOutputsZh(ctx: ItineraryAdjustRunContext): string {
  const day =
    ctx.targetDayNumber != null
      ? `第 ${ctx.targetDayNumber} 天`
      : ctx.targetDateIso ?? '目标日';
  const sub =
    ctx.subIntent === 'poi_slot_fill'
      ? 'POI 空档补全（推荐加入景点）'
      : ctx.subIntent === 'strong_modification'
        ? '强修改意图'
        : '探索/商量意图';
  if (ctx.subIntent === 'poi_slot_fill') {
    return `行程景点补全（POI_SLOT_FILL）：向稀疏日程追加推荐景点，只增不删；${day}${ctx.targetDateIso ? `（${ctx.targetDateIso}）` : ''}起优先补档。`;
  }
  return `单日行程调整（ITINERARY_ADJUST）：${day}${ctx.targetDateIso ? `（${ctx.targetDateIso}）` : ''}；${sub}。全周编排仅重算该日，其余日从 Trip 保留。`;
}

export function formatPoiSelectionOutputsAdjustZh(params: {
  researchRecallCount: number;
  scoringPoolCount: number;
  selectedCount: number;
  selectedNames: string[];
  metadata: Record<string, unknown>;
}): string {
  const level = params.metadata.itinerary_adjust_corridor_fallback_level as string | undefined;
  const levelZh = level ? FALLBACK_LEVEL_LOG_ZH[level as CorridorFallbackLevel] ?? level : '走廊筛选';
  const names =
    params.selectedNames.length > 0
      ? params.selectedNames.slice(0, 6).join('、')
      : '（见时间轴）';
  const dropped = (
    params.metadata.itinerary_adjust_corridor_fallback as
      | { tierAttempts?: Array<{ droppedGoldenCircle?: number }> }
      | undefined
  )?.tierAttempts?.slice(-1)?.[0]?.droppedGoldenCircle;
  const pruneNote =
    typeof dropped === 'number' && dropped > 0
      ? `；剔除内陆黄金圈绕路点 ${dropped} 个`
      : '';
  return (
    `改排走廊 POI：检索召回 ${params.researchRecallCount} → 合并打分池 ${params.scoringPoolCount} → 入选 ${params.selectedCount}（${levelZh}${pruneNote}）。` +
    `目标日候选：${names}。`
  );
}

export function formatPlanGenOutputsAdjustZh(params: {
  totalDays: number;
  targetDateIso: string;
  targetDayNumber?: number;
  targetPoiNames: string[];
  weekDigest?: ItineraryDayPoiDigest[];
}): string {
  const dayLabel =
    params.targetDayNumber != null
      ? `第 ${params.targetDayNumber} 天`
      : params.targetDateIso;
  const dateShort = formatShortDateForDigest(params.targetDateIso.slice(0, 10));
  const pois =
    params.targetPoiNames.length > 0
      ? params.targetPoiNames.join('、')
      : '（见草案时间轴）';
  const head = `全周骨架 ${params.totalDays} 天；${dayLabel}${dateShort ? `（${dateShort}）` : ''}按邻日走廊重算：${pois}。其余日从绑定 Trip 保留。`;
  const digest = formatItineraryDayPoiDigestZh(params.weekDigest ?? [], { maxDays: 4 });
  return digest ? `${head}${digest}` : head;
}

export function formatVerifyOutputsAdjustZh(params: {
  targetDateIso: string;
  scopedIssueCount: number;
  totalIssueCount: number;
  fatal: number;
  conflict: number;
  advisory: number;
}): string {
  const scopeNote =
    params.totalIssueCount > params.scopedIssueCount
      ? `（全周共 ${params.totalIssueCount} 条，日志仅统计目标日 ${params.scopedIssueCount} 条）`
      : '';
  return `目标日 ${params.targetDateIso} 可执行性：共 ${params.scopedIssueCount} 条${scopeNote}（致命 ${params.fatal}、冲突 ${params.conflict}、提示 ${params.advisory}）。`;
}

export function formatNarrateOutputsAdjustZh(params: {
  targetDateIso: string;
  targetDayNumber?: number;
}): string {
  const dayLabel =
    params.targetDayNumber != null
      ? `第 ${params.targetDayNumber} 天`
      : params.targetDateIso;
  return `已写出 ${dayLabel}（${params.targetDateIso}）的改排说明；未再生成全周 7 日讲解以避免与「只改一天」混淆。`;
}

export function extractPoiNamesFromScoredRows(scored: unknown[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of scored) {
    const poi = (row as { poi?: Record<string, unknown> })?.poi ?? row;
    if (!poi || typeof poi !== 'object') continue;
    const p = poi as Record<string, unknown>;
    const name = String(p.name ?? p.nameCN ?? p.nameEN ?? '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function formatTripAnchorItemHhmm(time: Date | string | null | undefined): string | undefined {
  return formatClockLabelOptional(time);
}

/** 改排前快照：优先绑定 Trip 库内正式行程，避免 PLAN_GEN 草案覆盖对比基准 */
export function captureItineraryAdjustBaselineSchedule(
  metadata: Record<string, unknown>,
  targetDateIso: string,
  sources: {
    tripDayRows?: TripDayAnchorRow[];
    itinerary?: OrchestratorState['itinerary'];
  },
): void {
  const existing = metadata.itinerary_adjust_baseline_schedule;
  if (Array.isArray(existing) && existing.length > 0) return;

  const target = targetDateIso.slice(0, 10);
  const fromTripRows = sources.tripDayRows
    ?.find((row) => row.dateIso.slice(0, 10) === target)
    ?.items.map((it) => ({
      name: String(it.name ?? '').trim(),
      type: it.type ?? 'POI',
      start_window: formatTripAnchorItemHhmm(it.startTime),
      end_window: undefined,
    }))
    .filter((it) => it.name.length > 0);

  if (fromTripRows?.length) {
    metadata.itinerary_adjust_baseline_schedule = fromTripRows;
    return;
  }

  const fromItinerary = extractScheduleItemsFromItineraryDay(sources.itinerary, target);
  if (fromItinerary.length > 0) {
    metadata.itinerary_adjust_baseline_schedule = fromItinerary;
  }
}

export function extractScheduleItemsFromItineraryDay(
  itinerary: OrchestratorState['itinerary'],
  targetDateIso: string,
): ItineraryAdjustScheduleItem[] {
  const day = itinerary?.days?.find((d) => String(d.date ?? '').slice(0, 10) === targetDateIso);
  if (!day?.items?.length) return [];
  return day.items
    .map((it) => ({
      name: String(it.location_ref?.name ?? '').trim(),
      type: it.type,
      start_window: it.start_window,
      end_window: it.end_window,
    }))
    .filter((it) => it.name.length > 0);
}

export function extractPoiNamesFromItineraryDay(
  itinerary: OrchestratorState['itinerary'],
  targetDateIso: string,
): string[] {
  const day = itinerary?.days?.find((d) => String(d.date ?? '').slice(0, 10) === targetDateIso);
  if (!day?.items?.length) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const it of day.items) {
    const t = String(it.type ?? 'POI').toUpperCase();
    if (t === 'DRIVE' || t === 'TRANSIT' || t === 'WALK' || t === 'REST') continue;
    const name = String(it.location_ref?.name ?? '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export type ItineraryDayPoiDigest = {
  dayNumber: number;
  dateIso?: string;
  poiNames: string[];
};

/** 从草案 itinerary 提取「第 N 天 → 景点名」摘要（供决策日志 / 前端展示） */
export function extractPoiDigestFromItinerary(
  itinerary: OrchestratorState['itinerary'],
  options?: { maxDays?: number; maxPoisPerDay?: number },
): ItineraryDayPoiDigest[] {
  const days = itinerary?.days ?? [];
  if (!days.length) return [];
  const maxDays = options?.maxDays ?? 8;
  const maxPoisPerDay = options?.maxPoisPerDay ?? 5;
  const out: ItineraryDayPoiDigest[] = [];
  for (let i = 0; i < Math.min(days.length, maxDays); i++) {
    const d = days[i];
    const dateIso = String(d.date ?? '').slice(0, 10) || undefined;
    const poiNames = dateIso
      ? extractPoiNamesFromItineraryDay(itinerary, dateIso).slice(0, maxPoisPerDay)
      : [];
    out.push({
      dayNumber: i + 1,
      dateIso,
      poiNames,
    });
  }
  return out;
}

function formatShortDateForDigest(dateIso: string | undefined): string | undefined {
  const d = String(dateIso ?? '').slice(0, 10);
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d || undefined;
  return `${Number(m[2])}/${Number(m[3])}`;
}

/** 例：`日程要点：第1天（11/1）冰河湖、钻石沙滩；第2天（11/2）维克` */
export function formatItineraryDayPoiDigestZh(
  digest: ItineraryDayPoiDigest[],
  options?: { maxDays?: number; emptyFallback?: string },
): string {
  if (!digest.length) return options?.emptyFallback ?? '';
  const maxDays = options?.maxDays ?? 6;
  const segments: string[] = [];
  for (const row of digest.slice(0, maxDays)) {
    const datePart = row.dateIso ? `（${formatShortDateForDigest(row.dateIso)}）` : '';
    const pois =
      row.poiNames.length > 0 ? row.poiNames.join('、') : '（暂无景点，见时间轴）';
    segments.push(`第${row.dayNumber}天${datePart}${pois}`);
  }
  const omitted = digest.length > maxDays ? `；其余 ${digest.length - maxDays} 天见时间轴` : '';
  return `日程要点：${segments.join('；')}${omitted}`;
}

export function filterVerifyIssuesToAdjustTarget<
  T extends { day?: string; item_id?: string; entityRef?: { id?: string }; message?: string },
>(issues: T[], targetDateIso: string | undefined, targetDayItems?: Array<{ id?: string }>): T[] {
  if (!targetDateIso) return issues;
  const date = targetDateIso.slice(0, 10);
  const itemIds = new Set(
    (targetDayItems ?? []).map((it) => String(it.id ?? '')).filter(Boolean),
  );
  return issues.filter((i) => {
    const issueDay = String(i.day ?? '').slice(0, 10);
    if (issueDay === date) return true;
    const entityId = String(i.entityRef?.id ?? i.item_id ?? '').trim();
    if (entityId && itemIds.has(entityId)) return true;
    return false;
  });
}

/** 从 VERIFY 决策日志 outputs_summary 提取 POI 名（开放时间冲突行） */
export function parsePoiNameFromVerifyOutputsSummary(summary: string): string | undefined {
  const m = String(summary ?? '').match(/开放时间冲突：「([^」]+)」/);
  return m?.[1]?.trim() || undefined;
}

function filterVerifyIssuesToDraftPoiNames<T extends { message?: string }>(
  issues: T[],
  draftPoiNames: string[],
): T[] {
  if (!draftPoiNames.length) return issues;
  return issues.filter((i) => {
    const name = parsePoiNameFromVerifyDetail(String(i.message ?? ''));
    if (!name) return true;
    return poiNameMatchesDraftSchedule(name, draftPoiNames);
  });
}

/** 改排出站：决策日志只保留「最终草案内 POI」的 VERIFY 开放时间行 */
export function filterDecisionLogVerifyToDraftPois(
  log: DecisionLogEntry[],
  draftPoiNames: string[],
  options?: { filterMetadataIssues?: boolean },
): DecisionLogEntry[] {
  if (!draftPoiNames.length) return log;
  const mapped = log.map((entry) => {
    if (entry.step !== 'VERIFY' || !options?.filterMetadataIssues) return entry;
    const issues = entry.metadata?.issues;
    if (!Array.isArray(issues) || issues.length === 0) return entry;
    return {
      ...entry,
      metadata: {
        ...entry.metadata,
        issues: filterVerifyIssuesToDraftPoiNames(
          issues as Array<{ message?: string }>,
          draftPoiNames,
        ),
      },
    };
  });
  return mapped.filter((entry) => {
    if (entry.step !== 'VERIFY') return true;
    const summary = String(entry.outputs_summary ?? '');
    if (!summary.includes('开放时间冲突：')) return true;
    const name = parsePoiNameFromVerifyOutputsSummary(summary);
    if (!name) return true;
    return poiNameMatchesDraftSchedule(name, draftPoiNames);
  });
}

/** REPAIR/NARRATE 后：剔除未写入最终草案的 VERIFY 开放时间审计行 */
export function pruneStaleVerifyDecisionLogForAdjustTarget(state: OrchestratorState): void {
  const ctx = resolveItineraryAdjustRunContext(state);
  if (!ctx.active || !ctx.targetDateIso) return;
  const draftNames = extractPoiNamesFromItineraryDay(state.itinerary, ctx.targetDateIso);
  if (!draftNames.length || !Array.isArray(state.decision_log)) return;
  state.decision_log = filterDecisionLogVerifyToDraftPois(state.decision_log, draftNames, {
    filterMetadataIssues: true,
  });
}

/** PLAN_GEN adaptive_replan / experience_curator 后：用最新 state.itinerary 刷新草案卡片 */
export function refreshItineraryAdjustOptimizationResult(state: OrchestratorState): void {
  const ctx = resolveItineraryAdjustRunContext(state);
  if (!ctx.active || !ctx.targetDateIso || !state.itinerary) return;
  if (ctx.metadata.itinerary_adjust_empty_target_optimize === true) return;

  applyPacingRelaxToAdjustTargetState(state);

  const targetDate = ctx.targetDateIso.slice(0, 10);
  const poiNames = extractPoiNamesFromItineraryDay(state.itinerary, targetDate);
  const scheduleItems = extractScheduleItemsFromItineraryDay(state.itinerary, targetDate);

  ctx.metadata.itinerary_adjust_result = buildItineraryAdjustOptimizationResult({
    metadata: ctx.metadata,
    targetDateIso: targetDate,
    targetDayNumber: ctx.targetDayNumber,
    poiNames,
    scheduleItems,
  });
}

/** NARRATE 后：只保留目标日叙述，并写入 optimization 摘要 */
export function scopeOrchestratorNarrationToAdjustTarget(state: OrchestratorState): void {
  const ctx = resolveItineraryAdjustRunContext(state);
  if (!ctx.active || !ctx.targetDateIso) return;

  const targetDate = ctx.targetDateIso.slice(0, 10);
  const narr = state.narration;
  if (!narr) return;

  if (Array.isArray(narr.day_by_day_narrative) && narr.day_by_day_narrative.length > 0) {
    const scoped = narr.day_by_day_narrative.filter(
      (d) => String(d.date ?? '').slice(0, 10) === targetDate,
    );
    narr.day_by_day_narrative = scoped.length > 0 ? scoped : narr.day_by_day_narrative.slice(0, 1);
  }

  if (typeof narr.day_by_day_text_zh === 'string' && narr.day_by_day_text_zh.trim()) {
    const lines = narr.day_by_day_text_zh.split(/\n\n+/);
    const kept = lines.filter(
      (block) =>
        block.includes(targetDate) ||
        (ctx.targetDayNumber != null && block.includes(`第 ${ctx.targetDayNumber} 天`)),
    );
    if (kept.length > 0) {
      narr.day_by_day_text_zh = kept.join('\n\n');
    }
  }

  refreshItineraryAdjustOptimizationResult(state);
  const optimization = ctx.metadata.itinerary_adjust_result as
    | ItineraryAdjustOptimizationResult
    | undefined;
  if (!optimization) return;

  pruneStaleVerifyDecisionLogForAdjustTarget(state);

  const dayNarrative = narr.day_by_day_narrative?.[0]?.narrative?.trim();
  if (dayNarrative && !optimization.optimization_summary_zh.includes(dayNarrative.slice(0, 20))) {
    narr.user_friendly_summary = optimization.optimization_summary_zh;
  } else {
    narr.user_friendly_summary = optimization.optimization_summary_zh;
  }

  narr.highlights = (narr.highlights ?? []).filter((h) => {
    const s = String(h);
    return s.includes(targetDate) || (ctx.targetDayNumber != null && s.includes(`第${ctx.targetDayNumber}`));
  });
}
