/**
 * Tradeoff dimension → trip-context narrative (Decision Space + Persona Alerts M2).
 */

import { DateTime } from 'luxon';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import { formatDriveDurationZhLong } from '../../trip-constraint-solver/utils/daily-drive-threshold.util';
import { buildFeasibilityIssueUserExplanation } from '../../trip-constraint-solver/utils/feasibility-issue-user-copy.util';
import type {
  AffectedScopeDisplay,
  TradeoffDimension,
  TradeoffDimensionKey,
} from '../types/decision-semantics.types';

export interface TradeoffNarrativeContext {
  issue?: FeasibilityIssueDto;
  affectedScopeDisplay?: AffectedScopeDisplay[];
  optionTitle?: string;
  optionDescription?: string;
  placeNames?: string[];
  /** planning | in_trip — affects tone */
  phase?: 'planning' | 'in_trip';
}

function truncate(text: string, maxLen: number): string {
  const t = String(text ?? '').trim();
  if (!t) return '';
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

function primaryDay(ctx: TradeoffNarrativeContext): number | undefined {
  const fromIssue = ctx.issue?.affectedDays?.[0] ?? ctx.issue?.anchors?.fromDayNumber;
  if (fromIssue != null) return fromIssue;
  const fromScope = ctx.affectedScopeDisplay?.find((s) => s.dayIndex != null)?.dayIndex;
  return fromScope;
}

function formatDayPhrase(day: number | undefined, timeHint?: 'morning' | 'afternoon' | 'evening'): string {
  if (day == null) return '行程中';
  const base = `Day ${day}`;
  if (timeHint === 'morning') return `${base} 早晨`;
  if (timeHint === 'afternoon') return `${base} 下午`;
  if (timeHint === 'evening') return `${base} 傍晚`;
  return base;
}

function inferTimeOfDay(issue?: FeasibilityIssueDto): 'morning' | 'afternoon' | 'evening' | undefined {
  const depart = issue?.anchors?.departAt ?? issue?.anchors?.activityStartAt ?? issue?.anchors?.fromTime;
  if (!depart) return undefined;
  const dt = DateTime.fromISO(depart, { setZone: true });
  if (!dt.isValid) {
    const hm = /^(\d{1,2}):(\d{2})/.exec(String(depart));
    if (!hm) return undefined;
    const hour = Number(hm[1]);
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }
  const hour = dt.hour;
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function collectPlaceNames(ctx: TradeoffNarrativeContext): string[] {
  const names = new Set<string>();
  for (const n of ctx.placeNames ?? []) {
    if (n?.trim()) names.add(n.trim());
  }
  for (const scope of ctx.affectedScopeDisplay ?? []) {
    for (const n of scope.placeNames ?? []) {
      if (n?.trim()) names.add(n.trim());
    }
    if (scope.label?.trim()) names.add(scope.label.trim());
  }
  const anchors = ctx.issue?.anchors;
  if (anchors?.fromPlaceLabel?.trim()) names.add(anchors.fromPlaceLabel.trim());
  if (anchors?.toPlaceLabel?.trim()) names.add(anchors.toPlaceLabel.trim());
  for (const proof of ctx.issue?.proofs ?? []) {
    if (proof.placeLabel?.trim()) names.add(proof.placeLabel.trim());
  }
  if (ctx.issue?.affectedScopeSummary?.trim()) {
    names.add(ctx.issue.affectedScopeSummary.trim());
  }
  return [...names].slice(0, 4);
}

function memberConstraintHint(issue?: FeasibilityIssueDto): string | undefined {
  const ids = issue?.uiHints?.affectedMemberIds;
  if (!Array.isArray(ids) || ids.length === 0) return undefined;
  if (ids.length === 1) return `其中 ${ids[0]} 的偏好/限制与此相关`;
  return `其中 ${ids.slice(0, 3).join('、')} 等 ${ids.length} 位成员的偏好与此相关`;
}

function connectivityHint(issue?: FeasibilityIssueDto): string | undefined {
  const from = issue?.anchors?.fromPlaceLabel?.trim();
  const to = issue?.anchors?.toPlaceLabel?.trim();
  if (from && to) return `衔接 ${from} → ${to}`;
  return undefined;
}

function daysSinceIso(iso?: string): number | undefined {
  if (!iso?.trim()) return undefined;
  const dt = DateTime.fromISO(iso, { setZone: true });
  if (!dt.isValid) return undefined;
  const days = Math.floor(DateTime.now().diff(dt, 'days').days);
  return days >= 0 ? days : undefined;
}

function staleEvidenceDays(issue?: FeasibilityIssueDto): number | undefined {
  let maxStale: number | undefined;
  for (const proof of issue?.proofs ?? []) {
    const days = daysSinceIso(proof.observedAt);
    if (days != null && (maxStale == null || days > maxStale)) maxStale = days;
  }
  return maxStale;
}

function primaryPlaceLabel(ctx: TradeoffNarrativeContext): string | undefined {
  const places = collectPlaceNames(ctx);
  return places[0];
}

function buildSafetyNarrative(
  row: TradeoffDimension,
  ctx: TradeoffNarrativeContext,
): string {
  const issue = ctx.issue;
  const day = primaryDay(ctx);
  const timeHint = inferTimeOfDay(issue);
  const dayPhrase = formatDayPhrase(day, timeHint);
  const place = primaryPlaceLabel(ctx);
  const staleDays = staleEvidenceDays(issue);
  const memberHint = memberConstraintHint(issue);
  const connect = connectivityHint(issue);

  const proofText = issue?.proofs?.find((p) => /禁入|潮汐|封闭|风险|安全|未核验|过期/i.test(`${p.currentFact} ${p.conclusion}`));
  const ruleKind =
    proofText && /潮汐|禁入/i.test(`${proofText.currentFact} ${proofText.conclusion}`)
      ? '官方潮汐/禁入规则'
      : proofText && /封闭|封路/i.test(`${proofText.currentFact} ${proofText.conclusion}`)
        ? '道路封闭信息'
        : '官方规则';

  if (staleDays != null && staleDays >= 7 && place) {
    const suggestion =
      timeHint === 'afternoon' && day != null
        ? `建议出发前再确认，或把该点移到 Day ${day + 1} 早晨以留出缓冲。`
        : '建议出发前再确认最新规则，或调整该日的先后顺序。';
    let narrative = `你们 ${dayPhrase} 计划去${place}，但${ruleKind}已 ${staleDays} 天未更新。${suggestion}`;
    if (memberHint) narrative += ` ${memberHint}。`;
    return truncate(narrative, 320);
  }

  if (place && day != null) {
    const lead =
      row.direction === 'IMPROVE'
        ? `选择此方案后，${dayPhrase} 在 ${place} 的安全余量会提高。`
        : `你们 ${dayPhrase} 计划在 ${place} 活动，但当前存在安全风险。`;
    const tail =
      row.direction === 'WORSEN'
        ? '建议查看决策检查器中的证据，或考虑替换/延后该点。'
        : '前后行程衔接更稳妥。';
    let narrative = `${lead}${row.explanation ? ` ${row.explanation}` : ''} ${tail}`;
    if (connect) narrative += `（${connect}）`;
    return truncate(narrative, 320);
  }

  if (issue?.category === 'environment' || issue?.issueKind?.includes('closure')) {
    return truncate(
      `${buildFeasibilityIssueUserExplanation(issue)} 建议结合封路/天气证据调整 ${day != null ? formatDayPhrase(day) : '相关天数'} 的走法。`,
      320,
    );
  }

  return truncate(
    row.explanation
      ? `${row.explanation}。${day != null ? `主要影响 ${formatDayPhrase(day)}。` : ''}${memberHint ? ` ${memberHint}。` : ''}`
      : buildFeasibilityIssueUserExplanation(issue ?? ({} as FeasibilityIssueDto)),
    320,
  );
}

function buildTimeNarrative(row: TradeoffDimension, ctx: TradeoffNarrativeContext): string {
  const issue = ctx.issue;
  const day = primaryDay(ctx);
  const dayPhrase = formatDayPhrase(day);
  const places = collectPlaceNames(ctx);
  const route =
    places.length >= 2 ? `${places[0]} → ${places[places.length - 1]}` : places[0];
  const travelMin = issue?.anchors?.travelMinutes;
  const shortfall = issue?.anchors?.shortfallMinutes;

  if (row.unit === 'MINUTE' && typeof row.value === 'number' && travelMin != null) {
    const dir =
      row.direction === 'IMPROVE'
        ? `可缩短 ${formatDriveDurationZhLong(Math.max(0, travelMin - row.value))} 左右的驾驶`
        : `驾驶时长将增加约 ${formatDriveDurationZhLong(row.value)}`;
    let narrative = `${dayPhrase}${route ? ` ${route}` : ''}：${dir}。`;
    if (shortfall && row.direction === 'IMPROVE') {
      narrative += ` 有助于消化原先超出上限的 ${formatDriveDurationZhLong(shortfall)}。`;
    }
    if (ctx.optionTitle) narrative += `（${ctx.optionTitle}）`;
    return truncate(narrative, 320);
  }

  if (row.explanation?.includes('→')) {
    return truncate(
      `${dayPhrase}${route ? ` 走 ${route}` : ''}：${row.explanation}。${ctx.optionDescription ? ctx.optionDescription : ''}`,
      320,
    );
  }

  return truncate(
    `${dayPhrase}${route ? `（${route}）` : ''}：${row.explanation ?? '行程时长会有变化'}。`,
    320,
  );
}

function buildFlexibilityNarrative(row: TradeoffDimension, ctx: TradeoffNarrativeContext): string {
  const day = primaryDay(ctx);
  const dayPhrase = formatDayPhrase(day);
  const connect = connectivityHint(ctx.issue);
  const memberHint = memberConstraintHint(ctx.issue);

  if (row.direction === 'IMPROVE') {
    const pct = row.unit === 'PERCENT' && typeof row.value === 'number' ? `${row.value}%` : undefined;
    let narrative = `${dayPhrase} 的可行度${pct ? `提升约 ${pct}` : '有所改善'}，转场与缓冲更充裕。`;
    if (connect) narrative += ` ${connect} 的压力会减轻。`;
    return truncate(narrative, 320);
  }

  let narrative = `${dayPhrase} 需要重新分配时间：${row.explanation ?? '多日行程节奏会被打乱'}。建议确认前后住宿与预约是否仍衔接得上。`;
  if (memberHint) narrative += ` ${memberHint}。`;
  return truncate(narrative, 320);
}

function buildCostNarrative(row: TradeoffDimension, ctx: TradeoffNarrativeContext): string {
  const day = primaryDay(ctx);
  const amount = row.unit === 'CURRENCY' && typeof row.value === 'number' ? row.value : undefined;
  const places = collectPlaceNames(ctx);
  const lodging = places.find((p) => /酒店|住宿|Guesthouse|Hotel/i.test(p)) ?? places[1];

  const delta = amount != null ? `约 ¥${Math.round(amount)} / 人` : '一定费用';
  const dir =
    row.direction === 'WORSEN'
      ? `预计增加 ${delta}`
      : row.direction === 'IMPROVE'
        ? `预计节省 ${delta}`
        : `费用基本持平`;

  let narrative = `${day != null ? formatDayPhrase(day) : '行程调整'}：${dir}。`;
  if (lodging) narrative += ` 主要与 ${lodging} 相关。`;
  if (ctx.optionTitle) narrative += `（${ctx.optionTitle}）`;
  return truncate(narrative, 320);
}

function buildPoiCoverageNarrative(row: TradeoffDimension, ctx: TradeoffNarrativeContext): string {
  const places = collectPlaceNames(ctx);
  const day = primaryDay(ctx);
  const kept = row.baselineValue ?? (row.unit === 'PERCENT' ? 95 : undefined);

  if (row.direction === 'WORSEN' || (typeof row.value === 'number' && row.value > 0 && row.direction !== 'IMPROVE')) {
    const missed = places.slice(1).join('、') || '部分景点';
    return truncate(
      `${formatDayPhrase(day)} 可能无法覆盖 ${missed}；核心体验保留率${kept != null ? `约 ${kept}%` : '会下降'}。建议确认成员最在意的 POI 是否仍保留。`,
      320,
    );
  }

  return truncate(
    `${formatDayPhrase(day)} 核心 POI 保留率${kept != null ? `约 ${kept}%` : '较高'}${places.length ? `（含 ${places.slice(0, 2).join('、')}）` : ''}。`,
    320,
  );
}

function buildFatigueNarrative(row: TradeoffDimension, ctx: TradeoffNarrativeContext): string {
  const day = primaryDay(ctx);
  const shortfall = ctx.issue?.anchors?.shortfallMinutes;
  const saved = row.unit === 'MINUTE' && typeof row.value === 'number' ? row.value : undefined;

  if (saved != null && shortfall) {
    return truncate(
      `${formatDayPhrase(day)} 驾驶负荷：${row.direction === 'IMPROVE' ? '预计减少' : '将增加'} ${formatDriveDurationZhLong(saved)}，${row.direction === 'IMPROVE' ? '缓解' : '加剧'} 超出每日上限的 ${formatDriveDurationZhLong(shortfall)}，疲劳与安全风险${row.direction === 'IMPROVE' ? '下降' : '上升'}。`,
      320,
    );
  }

  return buildTimeNarrative(row, ctx);
}

function buildGenericNarrative(row: TradeoffDimension, ctx: TradeoffNarrativeContext): string {
  const day = primaryDay(ctx);
  const places = collectPlaceNames(ctx);
  const placeBit = places.length ? `（${places.join('、')}）` : '';
  const memberHint = memberConstraintHint(ctx.issue);

  return truncate(
    `${formatDayPhrase(day)}${placeBit}：${row.explanation ?? '该维度会有变化'}。${memberHint ? `${memberHint}。` : ''}${ctx.optionTitle ? ` 方案：${ctx.optionTitle}。` : ''}`,
    320,
  );
}

const NARRATIVE_BUILDERS: Partial<
  Record<TradeoffDimensionKey, (row: TradeoffDimension, ctx: TradeoffNarrativeContext) => string>
> = {
  SAFETY: buildSafetyNarrative,
  TIME: buildTimeNarrative,
  FLEXIBILITY: buildFlexibilityNarrative,
  COST: buildCostNarrative,
  POI_COVERAGE: buildPoiCoverageNarrative,
  FATIGUE: buildFatigueNarrative,
};

export function buildTradeoffContextualNarrative(
  row: TradeoffDimension,
  ctx: TradeoffNarrativeContext = {},
): string {
  const builder = NARRATIVE_BUILDERS[row.dimension] ?? buildGenericNarrative;
  const narrative = builder(row, ctx);
  if (narrative.trim()) return narrative;
  return truncate(row.explanation ?? '该维度与当前行程上下文相关，建议结合决策检查器查看详情。', 320);
}

export function enrichTradeoffsWithContextualNarratives(
  tradeoffs: TradeoffDimension[],
  ctx: TradeoffNarrativeContext = {},
): TradeoffDimension[] {
  return tradeoffs.map((row) => ({
    ...row,
    contextualNarrative: row.contextualNarrative ?? buildTradeoffContextualNarrative(row, ctx),
  }));
}

/** Persona Alerts M2 — derive primary tradeoff dimensions from a feasibility issue. */
export function deriveTradeoffDimensionsFromFeasibilityIssue(
  issue: FeasibilityIssueDto,
): TradeoffDimension[] {
  const explanation = buildFeasibilityIssueUserExplanation(issue);
  const dims: TradeoffDimension[] = [];

  const push = (row: TradeoffDimension) => {
    if (!dims.some((d) => d.dimension === row.dimension)) dims.push(row);
  };

  if (issue.issueKind === 'daily_drive' || issue.category === 'transport') {
    push({
      dimension: 'TIME',
      direction: 'WORSEN',
      unit: 'MINUTE',
      value: issue.anchors?.travelMinutes,
      explanation: explanation,
    });
    push({
      dimension: 'FATIGUE',
      direction: 'WORSEN',
      explanation: '驾驶时长超限，疲劳累积',
    });
    push({
      dimension: 'SAFETY',
      direction: 'WORSEN',
      explanation: '疲劳与安全风险上升',
    });
  } else if (
    issue.category === 'environment' ||
    issue.category === 'access_capacity' ||
    issue.issueKind?.includes('closure')
  ) {
    push({
      dimension: 'SAFETY',
      direction: issue.priority === 'must_handle' ? 'WORSEN' : 'WORSEN',
      explanation,
    });
    if (staleEvidenceDays(issue) != null) {
      push({
        dimension: 'CERTAINTY',
        direction: 'WORSEN',
        explanation: `证据已超过 ${staleEvidenceDays(issue)} 天未更新`,
      });
    }
  } else if (issue.category === 'schedule' || issue.issueKind?.includes('pace')) {
    push({
      dimension: 'FLEXIBILITY',
      direction: 'WORSEN',
      explanation,
    });
    push({
      dimension: 'TIME',
      direction: 'WORSEN',
      explanation: '当日缓冲不足，衔接紧张',
    });
  } else if (issue.category === 'team_fit') {
    push({
      dimension: 'GROUP_FAIRNESS',
      direction: 'WORSEN',
      explanation,
    });
  } else if (issue.category === 'booking') {
    push({
      dimension: 'BOOKING_LOSS',
      direction: 'WORSEN',
      explanation,
    });
  } else {
    push({
      dimension: 'SAFETY',
      direction: issue.priority === 'must_handle' ? 'WORSEN' : 'UNCHANGED',
      explanation,
    });
  }

  return dims;
}

export function projectIssueTradeoffDimensionsForPersonaAlert(
  issue: FeasibilityIssueDto,
  ctx: Omit<TradeoffNarrativeContext, 'issue'> = {},
): TradeoffDimension[] {
  const base = deriveTradeoffDimensionsFromFeasibilityIssue(issue);
  return enrichTradeoffsWithContextualNarratives(base, { ...ctx, issue });
}
