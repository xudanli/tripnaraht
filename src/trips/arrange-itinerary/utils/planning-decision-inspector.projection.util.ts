import type { ConflictDto } from '../../dto/trip-conflicts.dto';
import { ConflictSeverity, ConflictType } from '../../dto/trip-conflicts.dto';
import type { PreviewRepairResponse } from '../../readiness/types/coverage-map.types';
import type { PlanProposal, PlanProposalChange } from '../types/plan-proposal.types';
import type {
  PlanningDecisionOption,
  PlanningDiagnostic,
} from '../types/planning-decision-pack.types';
import type {
  PlanningInspectorChangeRow,
  PlanningInspectorFeasibility,
  PlanningInspectorImpactTag,
  PlanningInspectorMemberConsensus,
  PlanningInspectorMemberStance,
  PlanningInspectorPlanDiff,
  PlanningInspectorTimelineMilestone,
} from '../types/planning-decision-inspector.types';
import type { UnifiedDecisionActionPreviewView } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { TripMutationSet } from '../../decision-semantics/types/decision-semantics.types';
import type { FeasibilityIssueAnchorsDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import { formatClockLabelOptional } from '../../../common/utils/format-clock-label.util';

type InspectorShiftIntent =
  | { kind: 'earlier'; minutes: number }
  | { kind: 'later'; minutes?: number }
  | { kind: 'unknown' };

function readPositiveMinutes(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value);
}

function parseHHmm(value: string): number {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function extractHm(text: string): string | undefined {
  const match = text.match(/(\d{1,2}:\d{2})/);
  return match?.[1];
}

function formatDeltaLabel(minutes: number): string {
  const sign = minutes > 0 ? '+' : minutes < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minutes));
  if (abs < 60) return `${sign}${abs} 分钟`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const body = m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
  return `${sign}${body}`;
}

export function resolveInspectorOption(
  proposal: PlanProposal,
  optionId?: string,
): PlanningDecisionOption | undefined {
  const pack = proposal.decisionPack;
  if (!pack?.options?.length) return undefined;
  if (optionId) {
    return pack.options.find((o) => o.id === optionId);
  }
  return pack.options.find((o) => o.recommended) ?? pack.options[0];
}

function rowFromCounterfactual(
  row: PlanningDecisionOption['counterfactualRows'][number],
  idx: number,
): PlanningInspectorChangeRow | null {
  if (!row.before || !row.after || row.before === row.after) return null;
  const beforeHm = extractHm(row.before) ?? row.before;
  const afterHm = extractHm(row.after) ?? row.after;
  const delta =
    beforeHm !== afterHm && /:\d{2}/.test(beforeHm) && /:\d{2}/.test(afterHm)
      ? parseHHmm(afterHm) - parseHHmm(beforeHm)
      : undefined;
  return {
    id: `chg_cf_${idx}`,
    itemLabel: row.label,
    before: row.before,
    after: row.after,
    deltaLabel: delta != null ? formatDeltaLabel(delta) : '—',
    deltaMinutes: delta,
  };
}

function rowsFromMoveChange(change: PlanProposalChange, idx: number): PlanningInspectorChangeRow[] {
  const rows: PlanningInspectorChangeRow[] = [];
  if (change.operation !== 'MOVE' || !change.from || !change.to) return rows;

  const fromHm = extractHm(change.from);
  const toHm = extractHm(change.to) ?? extractHm(change.startTime ?? '');
  if (fromHm && toHm) {
    const delta = parseHHmm(toHm) - parseHHmm(fromHm);
    rows.push({
      id: `chg_move_${idx}`,
      itemLabel: change.label ?? '行程项',
      before: fromHm,
      after: toHm,
      deltaLabel: formatDeltaLabel(delta),
      deltaMinutes: delta,
    });
  }
  return rows;
}

export function buildInspectorPlanDiff(
  proposal: PlanProposal,
  option?: PlanningDecisionOption,
): PlanningInspectorPlanDiff {
  const changeRows: PlanningInspectorChangeRow[] = [];
  const seen = new Set<string>();

  for (const [idx, row] of (option?.counterfactualRows ?? []).entries()) {
    const built = rowFromCounterfactual(row, idx);
    if (built && !seen.has(built.itemLabel)) {
      seen.add(built.itemLabel);
      changeRows.push(built);
    }
  }

  for (const [idx, change] of proposal.changes.entries()) {
    for (const row of rowsFromMoveChange(change, idx)) {
      if (!seen.has(row.itemLabel)) {
        seen.add(row.itemLabel);
        changeRows.push(row);
      }
    }
  }

  if (!changeRows.length) {
    for (const [idx, row] of proposal.diff.timelineChanges.entries()) {
      changeRows.push({
        id: `chg_diff_${idx}`,
        itemLabel: row.label,
        before: row.from ?? '（当前行程）',
        after: row.to ?? row.label,
        deltaLabel: '—',
      });
    }
  }

  const timePointCount = changeRows.filter((r) => r.deltaMinutes != null).length;
  const routeSegments = proposal.changes.filter(
    (c) => c.operation === 'MOVE' || (c.operation === 'ADD' && c.placeId),
  ).length;

  const impactTags: PlanningInspectorImpactTag[] = [];
  const memberScope = option?.impactScope?.itemIds?.length ?? 0;
  if (timePointCount > 0) {
    impactTags.push({
      id: 'impact_time_points',
      label: `修改 ${timePointCount} 个时间点`,
      tone: 'good',
    });
  }
  if (routeSegments > 0) {
    impactTags.push({
      id: 'impact_routes',
      label: `重算 ${routeSegments} 个路段`,
      tone: 'good',
    });
  }
  if (memberScope > 1) {
    impactTags.push({
      id: 'impact_members',
      label: `影响 ${memberScope} 位成员相关安排`,
      tone: 'muted',
    });
  }

  const unchangedItems = buildUnchangedItems(proposal, changeRows);

  const milestones: PlanningInspectorTimelineMilestone[] = changeRows
    .filter((r) => r.deltaMinutes != null)
    .map((r, i) => ({
      id: `ms_${i}`,
      label: r.itemLabel,
      originalTime: extractHm(r.before),
      newTime: extractHm(r.after),
      deltaMinutes: r.deltaMinutes,
    }));

  const bufferRow = changeRows.find((r) => /缓冲|buffer/i.test(r.itemLabel));
  const totalSaved = changeRows
    .filter((r) => r.deltaMinutes != null && r.deltaMinutes < 0)
    .reduce((sum, r) => sum + Math.abs(r.deltaMinutes ?? 0), 0);

  let bannerText: string | undefined;
  if (bufferRow?.deltaMinutes != null) {
    bannerText = `交通缓冲 ${bufferRow.before} → ${bufferRow.after}`;
  } else if (totalSaved > 0) {
    bannerText = `共节省约 ${formatDeltaLabel(-totalSaved)} 缓冲时间`;
  }

  return {
    optionId: option?.id,
    optionBadge: option?.badge,
    optionTitle: option?.headline ?? option?.title,
    changeRows,
    impactTags,
    unchangedItems,
    timelineCompare: {
      summary: proposal.diff.summary,
      milestones,
      bannerText,
    },
  };
}

function buildUnchangedItems(
  proposal: PlanProposal,
  changeRows: PlanningInspectorChangeRow[],
): string[] {
  if (!changeRows.length) return [];

  const items: string[] = [];
  const affectsLunch = changeRows.some((r) => /午餐|午饭|用餐|lunch/i.test(r.itemLabel));
  if (!affectsLunch) {
    items.push('午餐预约时间保持不变');
  }
  items.push('后续景点不会被删除');
  if (!proposal.tradeoffs.some((t) => /预算|费用|¥|cost/i.test(t))) {
    items.push('酒店与预算不受影响');
  }
  return items;
}

/** 决策空间 / 无草案 — 计划差异 Tab 空态 */
export function buildEmptyInspectorPlanDiff(): PlanningInspectorPlanDiff {
  return {
    changeRows: [],
    impactTags: [],
    unchangedItems: [],
    timelineCompare: { milestones: [] },
  };
}

function coerceRepairPreview(
  value: Record<string, unknown> | undefined,
): PreviewRepairResponse | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as unknown as PreviewRepairResponse;
}

function parseHmToMinutes(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const hm = extractHm(value);
  if (!hm) return undefined;
  return parseHHmm(hm);
}

function slotSnapshotLabel(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  fallback: string,
): string {
  const title = String(after?.title ?? before?.title ?? '').trim();
  return title || fallback;
}

function rowFromItineraryDiffEntry(
  entry: PreviewRepairResponse['itineraryDiff'][number],
  idx: number,
): PlanningInspectorChangeRow | null {
  const before = entry.before as Record<string, unknown> | undefined;
  const after = entry.after as Record<string, unknown> | undefined;

  if (entry.changeType === 'time_changed') {
    const useEndTime =
      typeof before?.endTime === 'string' &&
      typeof after?.endTime === 'string' &&
      before.endTime !== after.endTime;
    const beforeRaw = useEndTime ? before!.endTime : before?.time;
    const afterRaw = useEndTime ? after!.endTime : after?.time;
    const beforeHm = extractHm(String(beforeRaw ?? '')) ?? String(beforeRaw ?? '—');
    const afterHm = extractHm(String(afterRaw ?? '')) ?? String(afterRaw ?? '—');
    const beforeMin = parseHmToMinutes(beforeRaw);
    const afterMin = parseHmToMinutes(afterRaw);
    const delta =
      beforeMin != null && afterMin != null ? afterMin - beforeMin : undefined;
    const label = slotSnapshotLabel(before, after, entry.slotId);
    const itemLabel = useEndTime && !/结束|end/i.test(label) ? `${label}结束时间` : label;
    return {
      id: `row_diff_${idx}`,
      itemLabel,
      before: beforeHm,
      after: afterHm,
      deltaLabel: delta != null ? formatDeltaLabel(delta) : '—',
      deltaMinutes: delta,
    };
  }

  if (entry.changeType === 'removed') {
    const label = slotSnapshotLabel(before, after, entry.slotId);
    return {
      id: `row_diff_${idx}`,
      itemLabel: label,
      before: extractHm(String(before?.time ?? '')) ?? String(before?.title ?? '—'),
      after: '（移除）',
      deltaLabel: '—',
    };
  }

  if (entry.changeType === 'added') {
    const label = slotSnapshotLabel(before, after, entry.slotId);
    return {
      id: `row_diff_${idx}`,
      itemLabel: label,
      before: '（无）',
      after: extractHm(String(after?.time ?? '')) ?? String(after?.title ?? '—'),
      deltaLabel: '—',
    };
  }

  return null;
}

function rowsFromItineraryDiff(
  itineraryDiff: PreviewRepairResponse['itineraryDiff'] | undefined,
): PlanningInspectorChangeRow[] {
  if (!itineraryDiff?.length) return [];
  const rows: PlanningInspectorChangeRow[] = [];
  const seen = new Set<string>();
  for (const [idx, entry] of itineraryDiff.entries()) {
    const built = rowFromItineraryDiffEntry(entry, idx);
    if (built && !seen.has(built.itemLabel)) {
      seen.add(built.itemLabel);
      rows.push(built);
    }
  }
  return rows;
}

function appendBufferChangeRow(
  changeRows: PlanningInspectorChangeRow[],
  preview: UnifiedDecisionActionPreviewView,
): void {
  if (changeRows.some((r) => /缓冲|buffer/i.test(r.itemLabel))) return;
  const tradeoff = preview.tradeoffs?.find((t) => t.dimension === 'TIME');
  if (!tradeoff || typeof tradeoff.value !== 'number') return;

  const repairPreview = coerceRepairPreview(preview.repairPreview);
  const gapBefore = repairPreview?.before?.highlights?.find((h) =>
    /缓冲|buffer|gap/i.test(h),
  );
  const gapAfter = repairPreview?.after?.highlights?.find((h) =>
    /缓冲|buffer|gap/i.test(h),
  );
  if (!gapBefore && !gapAfter) return;

  changeRows.push({
    id: 'row_traffic_buffer',
    itemLabel: '交通缓冲',
    before: gapBefore ?? '—',
    after: gapAfter ?? '—',
    deltaLabel: formatDeltaLabel(
      tradeoff.direction === 'IMPROVE' ? -tradeoff.value : tradeoff.value,
    ),
    deltaMinutes:
      tradeoff.direction === 'IMPROVE' ? -tradeoff.value : tradeoff.value,
  });
}

function buildTimelineMilestones(
  changeRows: PlanningInspectorChangeRow[],
  unchangedSlots: Array<{ label: string; time: string }>,
): PlanningInspectorTimelineMilestone[] {
  const timeRows = changeRows.filter((r) => r.deltaMinutes != null);
  const milestones: PlanningInspectorTimelineMilestone[] = timeRows.map((r, i) => ({
    id: `ms_${i}`,
    label: r.itemLabel.replace(/结束时间$/, '').replace(/时间$/, '') || r.itemLabel,
    originalTime: extractHm(r.before) ?? r.before,
    newTime: extractHm(r.after) ?? r.after,
    deltaMinutes: r.deltaMinutes,
  }));

  for (const slot of unchangedSlots) {
    milestones.push({
      id: `ms_unchanged_${slot.label}`,
      label: slot.label,
      originalTime: slot.time,
      newTime: slot.time,
    });
  }

  milestones.sort((a, b) => {
    const aMin = parseHmToMinutes(a.newTime ?? a.originalTime) ?? 0;
    const bMin = parseHmToMinutes(b.newTime ?? b.originalTime) ?? 0;
    return aMin - bMin;
  });

  for (let i = 0; i < milestones.length - 1; i++) {
    const cur = parseHmToMinutes(milestones[i].newTime ?? milestones[i].originalTime);
    const next = parseHmToMinutes(milestones[i + 1].newTime ?? milestones[i + 1].originalTime);
    if (cur != null && next != null) {
      milestones[i].durationAfterMinutes = next - cur;
    }
  }

  return milestones;
}

function extractUnchangedTimelineSlots(
  repairPreview: PreviewRepairResponse | undefined,
  changeRows: PlanningInspectorChangeRow[],
): Array<{ label: string; time: string }> {
  const slots: Array<{ label: string; time: string }> = [];
  const affectsLunch = changeRows.some((r) => /午餐|午饭|用餐|lunch/i.test(r.itemLabel));
  if (affectsLunch) return slots;

  const highlights = [
    ...(repairPreview?.before?.highlights ?? []),
    ...(repairPreview?.after?.highlights ?? []),
  ];
  for (const h of highlights) {
    const lunchMatch = h.match(/(?:午餐|午饭|用餐|lunch)[^\d]*(\d{1,2}:\d{2})/i);
    if (lunchMatch) {
      slots.push({ label: '午餐', time: lunchMatch[1] });
      break;
    }
    const hmMatch = h.match(/^(.+?)\s+(\d{1,2}:\d{2})$/);
    if (hmMatch && /午餐|午饭|用餐|lunch/i.test(hmMatch[1])) {
      slots.push({ label: '午餐', time: hmMatch[2] });
      break;
    }
  }
  return slots;
}

function buildPlanDiffImpactTags(input: {
  changeRows: PlanningInspectorChangeRow[];
  preview: UnifiedDecisionActionPreviewView;
  routeSegmentCount?: number;
  memberCount?: number;
}): PlanningInspectorImpactTag[] {
  const tags: PlanningInspectorImpactTag[] = [];
  const timePointCount = input.changeRows.filter((r) => r.deltaMinutes != null).length;
  if (timePointCount > 0) {
    tags.push({
      id: 'impact_time_points',
      label: `修改 ${timePointCount} 个时间点`,
      tone: 'good',
    });
  }
  const routeCount = input.routeSegmentCount ?? 0;
  if (routeCount > 0) {
    tags.push({
      id: 'impact_routes',
      label: `重算 ${routeCount} 段路线`,
      tone: 'good',
    });
  }
  const members = input.preview.action.expectedImpact?.affectedMembers?.length ?? input.memberCount;
  if (members != null && members > 0) {
    tags.push({
      id: 'impact_members',
      label: `影响 ${members} 位成员`,
      tone: 'muted',
    });
  }
  const hasRemoval = input.changeRows.some((r) => r.after === '（移除）');
  if (!hasRemoval) {
    tags.push({ id: 'impact_booking', label: '预约不变', tone: 'muted' });
  }
  const budgetTradeoff = input.preview.tradeoffs?.find((t) => t.dimension === 'COST');
  if (!budgetTradeoff || budgetTradeoff.direction === 'UNCHANGED') {
    tags.push({ id: 'impact_budget', label: '预算不变', tone: 'muted' });
  }
  return tags;
}

function buildPlanDiffUnchangedItems(input: {
  changeRows: PlanningInspectorChangeRow[];
  unchangedSlots: Array<{ label: string; time: string }>;
}): string[] {
  const items: string[] = [];
  const affectsLunch = input.changeRows.some((r) => /午餐|午饭|用餐|lunch/i.test(r.itemLabel));
  const lunchSlot = input.unchangedSlots.find((s) => /午餐|午饭|用餐|lunch/i.test(s.label));
  if (!affectsLunch && lunchSlot) {
    items.push(`午餐预约保持 ${lunchSlot.time}`);
  } else if (!affectsLunch) {
    items.push('午餐预约时间保持不变');
  }
  const hasRemoval = input.changeRows.some((r) => r.after === '（移除）');
  items.push(hasRemoval ? '部分地点有删改' : '后续地点不删改');
  items.push('酒店与预算不受影响');
  return items;
}

function buildPlanDiffBannerText(changeRows: PlanningInspectorChangeRow[]): string | undefined {
  const bufferRow = changeRows.find((r) => /缓冲|buffer/i.test(r.itemLabel));
  const totalSaved = changeRows
    .filter((r) => r.deltaMinutes != null && r.deltaMinutes < 0)
    .reduce((sum, r) => sum + Math.abs(r.deltaMinutes ?? 0), 0);

  if (bufferRow) {
    const savedPart =
      totalSaved > 0 ? `总计节省 ${totalSaved} 分钟缓冲，` : '';
    return `${savedPart}交通缓冲由 ${bufferRow.before} → ${bufferRow.after}`;
  }
  if (totalSaved > 0) {
    return `共节省约 ${formatDeltaLabel(-totalSaved)} 缓冲时间`;
  }
  return undefined;
}

function formatIsoToHm(iso?: string): string | undefined {
  return formatClockLabelOptional(iso);
}

/**
 * 方案标题（提前离开）与反事实 diff（顺延下一站 suggestedTime）曾各走各的，导致「提前 120 分」对上「+5h15」。
 * 必须以 option/payload 极性为准，不能无脑用 suggestedTime - activityStart。
 */
function resolveInspectorShiftIntent(
  preview: UnifiedDecisionActionPreviewView,
): InspectorShiftIntent {
  const repairPreview = coerceRepairPreview(preview.repairPreview);
  const option = repairPreview?.option as
    | { actionType?: string; type?: string; payload?: Record<string, unknown> }
    | undefined;
  const payloads: Array<Record<string, unknown> | undefined> = [option?.payload];
  const mutations = (preview.proposedMutations as TripMutationSet | undefined)?.operations ?? [];
  for (const op of mutations) {
    const after = op.after as Record<string, unknown> | undefined;
    payloads.push(after?.payload as Record<string, unknown> | undefined);
  }

  for (const payload of payloads) {
    if (!payload) continue;
    const actionType = String(option?.actionType ?? option?.type ?? payload.actionType ?? '');
    const advance = readPositiveMinutes(payload.advanceMinutes);
    const shift =
      typeof payload.shiftMinutes === 'number' && Number.isFinite(payload.shiftMinutes)
        ? Math.round(payload.shiftMinutes)
        : undefined;

    if (actionType === 'shift_earlier' || (advance != null && advance > 0) || (shift != null && shift < 0)) {
      const minutes = advance ?? (shift != null ? Math.abs(shift) : undefined);
      if (minutes != null && minutes > 0) return { kind: 'earlier', minutes };
    }
    if (
      actionType === 'shift_departure' ||
      actionType === 'adjust_time' ||
      (shift != null && shift > 0)
    ) {
      return { kind: 'later', minutes: shift ?? readPositiveMinutes(payload.shortfallMinutes) };
    }
  }

  if (/提前\s*\d+\s*分钟|提早\s*\d+\s*分钟|提前离开|提前出发/i.test(preview.action.title)) {
    const fromTitle = /提前\s*(\d+)\s*分钟/.exec(preview.action.title);
    const minutes = fromTitle ? Number(fromTitle[1]) : undefined;
    if (minutes && minutes > 0) return { kind: 'earlier', minutes };
  }

  return { kind: 'unknown' };
}

function resolvePreviewDeltaMinutes(preview: UnifiedDecisionActionPreviewView): number | undefined {
  const impactDelta = preview.action.expectedImpact?.durationDelta;
  if (typeof impactDelta === 'number' && Number.isFinite(impactDelta)) return impactDelta;
  const timeTradeoff = preview.tradeoffs?.find((t) => t.dimension === 'TIME');
  if (!timeTradeoff || typeof timeTradeoff.value !== 'number') return undefined;
  const sign =
    timeTradeoff.direction === 'IMPROVE' ? -1 : timeTradeoff.direction === 'WORSEN' ? 1 : 0;
  return sign !== 0 ? sign * timeTradeoff.value : timeTradeoff.value;
}

function formatSignedMinutes(minutes: number): string {
  if (minutes > 0) return `+${minutes} 分钟`;
  if (minutes < 0) return `${minutes} 分钟`;
  return '0 分钟';
}

function shiftHm(hm: string, deltaMinutes: number): string | undefined {
  const base = parseHHmm(hm);
  const total = base + deltaMinutes;
  if (total < 0 || total >= 24 * 60) return undefined;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function extractTravelAnchors(
  preview: UnifiedDecisionActionPreviewView,
): FeasibilityIssueAnchorsDto | undefined {
  const repairPreview = coerceRepairPreview(preview.repairPreview);
  const optionPayload = repairPreview?.option?.payload as Record<string, unknown> | undefined;
  const mutations = (preview.proposedMutations as TripMutationSet | undefined)?.operations ?? [];
  for (const op of mutations) {
    const after = op.after as Record<string, unknown> | undefined;
    const payload = after?.payload as Record<string, unknown> | undefined;
    const nested = payload?.anchors as FeasibilityIssueAnchorsDto | undefined;
    if (nested?.toPlaceLabel || nested?.gapMinutes != null) return nested;
  }
  const fromOption = optionPayload?.anchors as FeasibilityIssueAnchorsDto | undefined;
  if (fromOption?.toPlaceLabel || fromOption?.gapMinutes != null) return fromOption;
  return undefined;
}

/** same_day_travel / 交通偏差 — 从 issue anchors 展开级联行（对齐设计稿四行表） */
function expandSameDayTravelPlanDiff(
  changeRows: PlanningInspectorChangeRow[],
  preview: UnifiedDecisionActionPreviewView,
): PlanningInspectorChangeRow[] {
  if (changeRows.some((r) => /交通缓冲|buffer/i.test(r.itemLabel)) && changeRows.length >= 3) {
    return changeRows;
  }

  const anchors = extractTravelAnchors(preview);
  if (!anchors?.toPlaceLabel && anchors?.gapMinutes == null) return changeRows;

  const intent = resolveInspectorShiftIntent(preview);
  const timedRow = changeRows.find(
    (r) => r.deltaMinutes != null && /:\d{2}/.test(r.before) && /:\d{2}/.test(r.after),
  );

  const beforeArrive =
    formatIsoToHm(anchors?.activityStartAt ?? anchors?.toTime) ??
    (timedRow ? extractHm(timedRow.before) : undefined);
  const beforeDepart = formatIsoToHm(anchors?.departAt ?? anchors?.fromTime);

  let delta: number | undefined;
  let afterArrive: string | undefined;
  let afterDepart: string | undefined;

  if (intent.kind === 'earlier') {
    delta = -intent.minutes;
    afterDepart = beforeDepart ? shiftHm(beforeDepart, delta) : undefined;
    afterArrive = beforeArrive ? shiftHm(beforeArrive, delta) : undefined;
  } else {
    afterArrive =
      formatIsoToHm(anchors?.suggestedTime) ??
      (timedRow ? extractHm(timedRow.after) : undefined);
    delta = timedRow?.deltaMinutes;
    if (delta == null && beforeArrive && afterArrive) {
      delta = parseHHmm(afterArrive) - parseHHmm(beforeArrive);
    }
    if (intent.kind === 'later' && intent.minutes != null && (delta == null || Math.sign(delta) < 0)) {
      // 顺延应以正位移为准；避免 suggestedTime 缺省时落成提前
      delta = intent.minutes;
    }
    afterDepart = beforeDepart && delta != null ? shiftHm(beforeDepart, delta) : undefined;
  }

  if (delta == null || delta === 0) return changeRows;

  const rows: PlanningInspectorChangeRow[] = [];
  const turnaroundMinutes = anchors?.bufferMinutes ?? 5;

  if (beforeDepart && anchors?.fromPlaceLabel) {
    const fromEndBefore = shiftHm(beforeDepart, -turnaroundMinutes);
    const fromEndAfter = afterDepart ? shiftHm(afterDepart, -turnaroundMinutes) : undefined;
    if (fromEndBefore && fromEndAfter) {
      rows.push({
        id: 'row_from_end',
        itemLabel: `${anchors.fromPlaceLabel}结束时间`,
        before: fromEndBefore,
        after: fromEndAfter,
        deltaLabel: formatDeltaLabel(delta),
        deltaMinutes: delta,
      });
    }
    if (afterDepart) {
      rows.push({
        id: 'row_depart',
        itemLabel: '出发时间',
        before: beforeDepart,
        after: afterDepart,
        deltaLabel: formatDeltaLabel(delta),
        deltaMinutes: delta,
      });
    }
  }

  if (beforeArrive && afterArrive) {
    const toLabel = anchors?.toPlaceLabel ?? timedRow?.itemLabel ?? '下一站';
    rows.push({
      id: 'row_arrive',
      itemLabel: /^抵达/.test(toLabel) ? toLabel : `抵达${toLabel}`,
      before: beforeArrive,
      after: afterArrive,
      deltaLabel: formatDeltaLabel(delta),
      deltaMinutes: delta,
    });
  }

  if (typeof anchors?.gapMinutes === 'number') {
    const beforeGap = anchors.gapMinutes;
    const afterGap = beforeGap - delta;
    rows.push({
      id: 'row_traffic_buffer',
      itemLabel: '交通缓冲',
      before: formatSignedMinutes(beforeGap),
      after: formatSignedMinutes(afterGap),
      deltaLabel: formatDeltaLabel(afterGap - beforeGap),
      deltaMinutes: afterGap - beforeGap,
    });
  }

  return rows.length >= 2 ? rows : changeRows;
}

/** 决策空间 — 从 decision-problems option preview 投影计划差异 */
export function buildInspectorPlanDiffFromPreview(
  preview: UnifiedDecisionActionPreviewView,
): PlanningInspectorPlanDiff {
  const repairPreview = coerceRepairPreview(preview.repairPreview);
  const itineraryDiff = repairPreview?.itineraryDiff;
  let changeRows = rowsFromItineraryDiff(itineraryDiff);

  if (!changeRows.length) {
    const intent = resolveInspectorShiftIntent(preview);
    const mutations =
      (preview.proposedMutations as TripMutationSet | undefined)?.operations ?? [];
    for (const [idx, op] of mutations.entries()) {
      const after = op.after as Record<string, unknown> | undefined;
      const payload = after?.payload as Record<string, unknown> | undefined;
      const anchors = payload?.anchors as FeasibilityIssueAnchorsDto | undefined;
      const label =
        (intent.kind === 'earlier'
          ? anchors?.fromPlaceLabel?.trim()
          : anchors?.toPlaceLabel?.trim() || anchors?.fromPlaceLabel?.trim()) ||
        preview.action.title;

      let beforeHm =
        formatIsoToHm(anchors?.departAt) ??
        formatIsoToHm(anchors?.fromTime) ??
        formatIsoToHm(anchors?.activityStartAt) ??
        formatIsoToHm(anchors?.toTime);
      let afterHm: string | undefined;
      let deltaMinutes: number | undefined;

      if (intent.kind === 'earlier') {
        deltaMinutes = -intent.minutes;
        afterHm = beforeHm ? shiftHm(beforeHm, deltaMinutes) : undefined;
      } else {
        beforeHm =
          formatIsoToHm(anchors?.activityStartAt) ??
          formatIsoToHm(anchors?.toTime) ??
          formatIsoToHm(anchors?.fromTime) ??
          beforeHm;
        afterHm =
          formatIsoToHm(anchors?.suggestedTime) ??
          formatIsoToHm(String(payload?.suggestedValue ?? ''));
        if (beforeHm && afterHm) {
          deltaMinutes = parseHHmm(afterHm) - parseHHmm(beforeHm);
        } else {
          deltaMinutes = resolvePreviewDeltaMinutes(preview);
        }
        if (
          intent.kind === 'later' &&
          intent.minutes != null &&
          (deltaMinutes == null || Math.sign(deltaMinutes) <= 0)
        ) {
          deltaMinutes = intent.minutes;
          afterHm = beforeHm ? shiftHm(beforeHm, deltaMinutes) : afterHm;
        }
      }

      changeRows.push({
        id: `chg_preview_${idx}`,
        itemLabel: label,
        before: beforeHm ?? '（当前）',
        after: afterHm ?? preview.action.summary,
        deltaLabel: deltaMinutes != null ? formatDeltaLabel(deltaMinutes) : '—',
        deltaMinutes,
      });
    }
  }

  if (!changeRows.length) {
    changeRows.push({
      id: 'chg_preview_summary',
      itemLabel: preview.action.title,
      before: '（当前行程）',
      after: preview.action.summary,
      deltaLabel: '—',
    });
  }

  const expanded = expandSameDayTravelPlanDiff(changeRows, preview);
  if (expanded.length > changeRows.length) {
    changeRows = expanded;
  }

  appendBufferChangeRow(changeRows, preview);

  const timeChangedCount = itineraryDiff?.filter((e) => e.changeType === 'time_changed').length;
  const routeSegmentCount =
    timeChangedCount != null && timeChangedCount > 1
      ? Math.max(1, timeChangedCount - 1)
      : changeRows.filter((r) => r.deltaMinutes != null).length > 1
        ? changeRows.filter((r) => r.deltaMinutes != null).length - 1
        : 0;

  const unchangedSlots = extractUnchangedTimelineSlots(repairPreview, changeRows);
  const impactTags = buildPlanDiffImpactTags({
    changeRows,
    preview,
    routeSegmentCount,
  });
  const unchangedItems = buildPlanDiffUnchangedItems({ changeRows, unchangedSlots });
  const milestones = buildTimelineMilestones(changeRows, unchangedSlots);
  const bannerText = buildPlanDiffBannerText(changeRows) ?? preview.action.summary;

  return {
    optionId: preview.actionId,
    optionTitle: preview.action.title,
    changeRows,
    impactTags,
    unchangedItems,
    timelineCompare: {
      summary: preview.action.summary,
      milestones,
      bannerText,
    },
  };
}

/** 决策空间 — 选定 repair option 后的可执行性投影 */
export function buildInspectorFeasibilityFromPreview(input: {
  preview: UnifiedDecisionActionPreviewView;
  planDiff: PlanningInspectorPlanDiff;
  conflicts: ConflictDto[];
  primaryConflict?: ConflictDto;
  travelMinutes?: number;
}): PlanningInspectorFeasibility {
  const gateChecks = buildGateChecksForProblem(input.conflicts, input.primaryConflict);
  const blocked = gateChecks.some((g) => g.status === 'block');
  const requiresConfirmation = input.preview.action.requiresConfirmation === true;
  const canSafelyWrite = input.preview.action.allowed !== false && !blocked && !requiresConfirmation;

  const timePointUpdates = input.planDiff.changeRows.filter((r) => r.deltaMinutes != null).length;
  const executionSummary: PlanningInspectorFeasibility['executionSummary'] = [];
  if (timePointUpdates > 0) {
    executionSummary.push({
      id: 'exec_time_points',
      label: '更新时间点',
      value: `${timePointUpdates} 个`,
      icon: 'clock',
    });
  }

  let verdictStatus: PlanningInspectorFeasibility['verdict']['status'] = 'feasible';
  if (blocked) verdictStatus = 'blocked';
  else if (requiresConfirmation) verdictStatus = 'caution';

  return {
    canSafelyWrite,
    headline: canSafelyWrite
      ? '当前方案可以安全写入行程'
      : requiresConfirmation
        ? '当前方案需确认后再写入'
        : '当前方案存在阻塞项，暂不建议写入',
    subheadline: input.preview.action.summary,
    gateChecks,
    ...(input.travelMinutes != null
      ? {
          validityWarning: {
            message: '判断依据有时效限制',
            retriggerCondition: `若道路预计耗时超过 ${input.travelMinutes + 5} 分钟，将重新触发决策`,
          },
        }
      : {}),
    executionSummary,
    verdict: {
      status: verdictStatus,
      message: canSafelyWrite ? '最终结论：可执行' : '最终结论：谨慎可执行',
      detail: input.preview.action.summary,
    },
  };
}

export interface CollaboratorInput {
  userId: string;
  role: string;
  displayName?: string | null;
}

export function buildInspectorMemberConsensus(input: {
  proposal: PlanProposal;
  collaborators: CollaboratorInput[];
  ownerId?: string;
  voteDiscussionHints?: string[];
}): PlanningInspectorMemberConsensus {
  const { proposal, collaborators } = input;
  const members = collaborators.length
    ? collaborators
    : [{ userId: proposal.userId, role: 'owner', displayName: '行程创建者' }];

  const opinions: PlanningInspectorMemberStance[] = members.map((member) => {
    const isCreator = member.userId === proposal.userId || member.userId === input.ownerId;
    const isOwner = member.role === 'owner' || member.userId === input.ownerId;

    if (isCreator || isOwner) {
      const hasAnswer = Boolean(proposal.answer?.trim());
      return {
        memberId: member.userId,
        displayName: member.displayName?.trim() || '行程创建者',
        role: member.role,
        stance: hasAnswer ? 'support' : 'pending',
        ...(hasAnswer ? { comment: proposal.answer!.trim() } : {}),
      };
    }

    const objectionHint = input.voteDiscussionHints?.find((h) =>
      h.toLowerCase().includes(member.userId),
    );
    if (objectionHint) {
      return {
        memberId: member.userId,
        displayName: member.displayName?.trim() || member.userId.slice(0, 8),
        role: member.role,
        stance: 'objection',
        comment: objectionHint,
      };
    }

    return {
      memberId: member.userId,
      displayName: member.displayName?.trim() || member.userId.slice(0, 8),
      role: member.role,
      stance: 'pending',
    };
  });

  const supportCount = opinions.filter((o) => o.stance === 'support').length;
  const objectionCount = opinions.filter((o) => o.stance === 'objection').length;
  const pendingCount = opinions.filter((o) => o.stance === 'pending').length;
  const totalMembers = opinions.length;

  const pct = (n: number) => (totalMembers > 0 ? Math.round((n / totalMembers) * 100) : 0);

  const aiSummary = buildAiSummary(proposal, opinions);

  let statusMessage = '当前存在可接受多数，但未达完全一致';
  if (totalMembers === 0) {
    statusMessage = '暂无成员信息';
  } else if (supportCount === 0 && objectionCount === 0) {
    statusMessage = '暂无成员表态';
  } else if (objectionCount === 0 && pendingCount === 0) {
    statusMessage = '成员已达成一致，可确认写入';
  } else if (objectionCount > supportCount) {
    statusMessage = '异议较多，建议继续协商或调整方案';
  }

  return {
    summaryBar: `${totalMembers} 位成员中：${supportCount} 人支持，${objectionCount} 人有异议，${pendingCount} 人未回复`,
    supportCount,
    objectionCount,
    pendingCount,
    totalMembers,
    opinions,
    aiSummary,
    assessment: {
      supportPercent: pct(supportCount),
      objectionPercent: pct(objectionCount),
      pendingPercent: pct(pendingCount),
      statusMessage,
      canCreatorConfirm: supportCount >= objectionCount,
    },
    updatedAt: new Date().toISOString(),
  };
}

function buildAiSummary(
  proposal: PlanProposal,
  opinions: PlanningInspectorMemberStance[],
): string[] {
  const lines: string[] = [];
  if (proposal.tradeoffs.length) {
    lines.push(`多数成员关注：${proposal.tradeoffs[0]}`);
  }
  const objections = opinions.filter((o) => o.stance === 'objection');
  if (objections.length) {
    lines.push(`${objections.length} 位成员对体验压缩或时段调整有顾虑`);
  }
  if (proposal.benefits?.drivingTimeReducedMinutes) {
    lines.push(
      `交通缓冲有望改善约 ${proposal.benefits.drivingTimeReducedMinutes} 分钟`,
    );
  }
  return lines.slice(0, 3);
}

/** 决策空间 — 成员共识 Tab 空态（无草案、无表态） */
export function buildEmptyInspectorMemberConsensus(
  collaborators: CollaboratorInput[],
): PlanningInspectorMemberConsensus {
  const members = collaborators.length
    ? collaborators
    : [{ userId: 'unknown', role: 'owner', displayName: '行程创建者' }];

  const opinions: PlanningInspectorMemberStance[] = members.map((member) => ({
    memberId: member.userId,
    displayName: member.displayName?.trim() || member.userId.slice(0, 8),
    role: member.role,
    stance: 'pending' as const,
  }));

  const totalMembers = opinions.length;

  return {
    summaryBar:
      totalMembers > 0
        ? `${totalMembers} 位成员中：0 人支持，0 人有异议，${totalMembers} 人未回复`
        : '暂无成员信息',
    supportCount: 0,
    objectionCount: 0,
    pendingCount: totalMembers,
    totalMembers,
    opinions,
    aiSummary: [],
    assessment: {
      supportPercent: 0,
      objectionPercent: 0,
      pendingPercent: totalMembers > 0 ? 100 : 0,
      statusMessage: '选定方案后可查看成员共识',
      canCreatorConfirm: false,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function buildInspectorFeasibility(input: {
  proposal: PlanProposal;
  option?: PlanningDecisionOption;
  planDiff: PlanningInspectorPlanDiff;
  consensus: PlanningInspectorMemberConsensus;
  conflicts: ConflictDto[];
  isMonitorStale?: boolean;
  travelMinutes?: number;
  validUntilDisplay?: string;
}): PlanningInspectorFeasibility {
  const { proposal, planDiff, consensus } = input;
  const diagnostics = proposal.decisionPack?.diagnostics ?? [];

  const gateChecks = buildGateChecks(proposal, diagnostics, input.conflicts);

  const blocked = gateChecks.some((g) => g.status === 'block');
  const warn = gateChecks.some((g) => g.status === 'warn');
  const canSafelyWrite =
    proposal.validation.status !== 'BLOCK' && !blocked && !input.isMonitorStale;

  const optionTitle = input.option?.headline ?? input.option?.title ?? '当前方案';
  const headline = canSafelyWrite
    ? '当前方案可以安全写入行程'
    : proposal.validation.status === 'BLOCK'
      ? '当前方案存在阻塞项，暂不建议写入'
      : '当前方案需确认风险后再写入';

  const subheadline = canSafelyWrite
    ? `${optionTitle}：${proposal.diff.summary}`
    : proposal.validation.warnings[0] ?? proposal.validation.conflicts[0]?.message;

  const travelMin = input.travelMinutes;
  const retrigger = travelMin != null ? travelMin + 5 : undefined;

  const timePointUpdates = planDiff.changeRows.filter((r) => r.deltaMinutes != null).length;
  const routeRecalc = proposal.changes.filter((c) => c.operation === 'MOVE').length;

  let verdictStatus: PlanningInspectorFeasibility['verdict']['status'] = 'feasible';
  if (blocked) verdictStatus = 'blocked';
  else if (warn || proposal.validation.status === 'WARN') verdictStatus = 'caution';

  const executionSummary: PlanningInspectorFeasibility['executionSummary'] = [];
  if (timePointUpdates > 0 || planDiff.changeRows.length > 0) {
    executionSummary.push({
      id: 'exec_time_points',
      label: '更新时间点',
      value: `${timePointUpdates || planDiff.changeRows.length} 个`,
      icon: 'clock',
    });
  }
  if (routeRecalc > 0) {
    executionSummary.push({
      id: 'exec_routes',
      label: '重算路线段',
      value: `${routeRecalc} 段`,
      icon: 'route',
    });
  }
  const notifyCount = Math.max(consensus.objectionCount, consensus.pendingCount, 0);
  if (notifyCount > 0) {
    executionSummary.push({
      id: 'exec_notify',
      label: '通知成员',
      value: `${notifyCount} 位`,
      icon: 'users',
    });
  }

  return {
    canSafelyWrite,
    headline,
    subheadline,
    gateChecks,
    ...(travelMin != null && retrigger != null
      ? {
          validityWarning: {
            message: input.validUntilDisplay ?? '判断依据有时效限制',
            retriggerCondition: `若道路预计耗时超过 ${retrigger} 分钟，将重新触发决策`,
          },
        }
      : {}),
    executionSummary,
    verdict: {
      status: verdictStatus,
      message:
        verdictStatus === 'feasible'
          ? '最终结论：可执行'
          : verdictStatus === 'caution'
            ? '最终结论：谨慎可执行'
            : '最终结论：不可执行',
      detail:
        verdictStatus === 'feasible'
          ? '风险可控，满足当前约束与门禁条件'
          : subheadline,
    },
    validUntil: proposal.expiresAt,
  };
}

/** 决策空间 — 无草案时可执行性 Tab（空态 / 仅问题级门禁） */
export function buildInspectorFeasibilityForProblem(input: {
  conflicts: ConflictDto[];
  primaryConflict?: ConflictDto;
  travelMinutes?: number;
}): PlanningInspectorFeasibility {
  const gateChecks = buildGateChecksForProblem(input.conflicts, input.primaryConflict);
  const blocked = gateChecks.some((g) => g.status === 'block');
  const warn = gateChecks.some((g) => g.status === 'warn');

  return {
    canSafelyWrite: false,
    headline: '尚未选定具体方案，暂无法评估写入可行性',
    subheadline: input.primaryConflict?.description ?? '请在中栏选择修复方案或生成草案',
    gateChecks,
    ...(input.travelMinutes != null
      ? {
          validityWarning: {
            message: '判断依据有时效限制',
            retriggerCondition: `若道路预计耗时超过 ${input.travelMinutes + 5} 分钟，将重新触发决策`,
          },
        }
      : {}),
    executionSummary: [],
    verdict: {
      status: blocked ? 'blocked' : warn ? 'caution' : 'feasible',
      message: blocked ? '最终结论：需先处理问题' : '最终结论：待选方案',
      detail: input.primaryConflict?.description,
    },
  };
}

function buildGateChecksForProblem(
  conflicts: ConflictDto[],
  primary?: ConflictDto,
): PlanningInspectorFeasibility['gateChecks'] {
  if (!conflicts.length && !primary) {
    return [{ id: 'gate_data', label: '行程冲突', status: 'pass' as const }];
  }

  const hasOverlap = conflicts.some((c) => c.type === ConflictType.TIME_CONFLICT);
  const hasBooking = conflicts.some((c) =>
    [ConflictType.LUNCH_WINDOW, ConflictType.LUNCH_MISSING].includes(c.type),
  );
  const hasTransport = conflicts.some((c) =>
    [ConflictType.TRANSPORT_INSUFFICIENT, ConflictType.BUFFER_INSUFFICIENT].includes(c.type),
  );

  return [
    { id: 'gate_time_conflict', label: '时间冲突', status: hasOverlap ? 'warn' : 'pass' },
    { id: 'gate_schedule', label: '日程可行性', status: primary ? 'warn' : 'pass' },
    { id: 'gate_booking', label: '预约影响', status: hasBooking ? 'block' : 'pass' },
    { id: 'gate_transport', label: '通行与缓冲', status: hasTransport ? 'warn' : 'pass' },
  ];
}

export function buildInspectorTabEmptyState(input: {
  causalChainNodeCount: number;
  planDiffRowCount: number;
  memberHasStance: boolean;
  hasProposal: boolean;
}): import('../types/planning-decision-inspector.types').PlanningInspectorTabEmptyState {
  return {
    causalChain: input.causalChainNodeCount === 0,
    planDiff: input.planDiffRowCount === 0,
    memberConsensus: !input.memberHasStance,
    feasibility: !input.hasProposal,
  };
}

function buildGateChecks(
  proposal: PlanProposal,
  diagnostics: PlanningDiagnostic[],
  conflicts: ConflictDto[],
): PlanningInspectorFeasibility['gateChecks'] {
  const hasOverlap = diagnostics.some((d) => d.code === 'overlap_time') ||
    proposal.validation.conflicts.some((c) => c.kind.includes('overlap'));
  const hasHours = diagnostics.some((d) => d.code === 'late_end_time') ||
    proposal.validation.warnings.some((w) => /21|22|营业|偏晚/i.test(w));
  const hasBooking = conflicts.some((c) =>
    [ConflictType.LUNCH_WINDOW, ConflictType.LUNCH_MISSING].includes(c.type),
  ) && proposal.validation.status === 'BLOCK';
  const hasDrive = diagnostics.some((d) => /drive|intensity/i.test(d.code));
  const hasMemberHard = conflicts.some(
    (c) => c.severity === ConflictSeverity.HIGH && c.type !== ConflictType.TIME_CONFLICT,
  );
  const stale = proposal.status === 'STALE';

  return [
    {
      id: 'gate_time_conflict',
      label: '时间冲突',
      status: hasOverlap ? 'warn' : 'pass',
    },
    {
      id: 'gate_business_hours',
      label: '营业时间',
      status: hasHours ? 'warn' : 'pass',
    },
    {
      id: 'gate_booking',
      label: '预约影响',
      status: hasBooking ? 'block' : 'pass',
    },
    {
      id: 'gate_drive_rest',
      label: '驾驶与休息限制',
      status: hasDrive ? 'warn' : 'pass',
    },
    {
      id: 'gate_member_hard',
      label: '成员硬约束',
      status: hasMemberHard ? 'warn' : 'pass',
    },
    {
      id: 'gate_data_freshness',
      label: '数据新鲜度',
      status: stale ? 'warn' : 'pass',
    },
  ];
}

export function buildInspectorRefreshUrl(
  tripId: string,
  opts: {
    proposalId?: string;
    problemId?: string;
    optionId?: string;
    conflictId?: string;
  },
): string {
  const params = new URLSearchParams();
  if (opts.proposalId) params.set('proposalId', opts.proposalId);
  if (opts.problemId) params.set('problemId', opts.problemId);
  if (opts.optionId) params.set('optionId', opts.optionId);
  if (opts.conflictId) params.set('conflictId', opts.conflictId);
  return `/api/trips/${tripId}/arrange-itinerary/decision-inspector?${params}`;
}
