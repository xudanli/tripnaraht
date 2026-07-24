/**
 * Normalizes repair / alternative impactSummary strings → TradeoffDimension[].
 */

import { DateTime } from 'luxon';
import type { PreviewRepairResponse } from '../../readiness/types/coverage-map.types';
import type { TradeoffDimension, TradeoffDimensionKey, TradeoffUnit } from '../types/decision-semantics.types';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type { RepairOption } from '../../readiness/types/coverage-map.types';
import { isInsertRestDayRepairPayload } from '../../trip-constraint-solver/utils/travel-timing-repair.util';
import { extractTradeoffsFromRepairPreview } from './repair-preview-tradeoff.util';

const DAY_PATTERN = /(?:\+|增加|多)\s*(\d+(?:\.\d+)?)\s*天/;
const HOUR_PATTERN = /(\d+(?:\.\d+)?)\s*小时/;
const MINUTE_PATTERN = /(\d+)\s*分钟/;
const CURRENCY_PATTERN = /(?:\+|增加|约)?\s*[¥￥]?\s*(\d+(?:\.\d+)?)/;
const PERCENT_PATTERN = /(\d+(?:\.\d+)?)\s*%/;

function pushUnique(tradeoffs: TradeoffDimension[], item: TradeoffDimension): void {
  const exists = tradeoffs.some(
    (t) => t.dimension === item.dimension && t.direction === item.direction && t.explanation === item.explanation,
  );
  if (!exists) tradeoffs.push(item);
}

function parseImpactSummary(summary: string | undefined, description: string): TradeoffDimension[] {
  const tradeoffs: TradeoffDimension[] = [];
  const text = `${summary ?? ''} ${description}`.trim();
  if (!text) return tradeoffs;

  const dayMatch = text.match(DAY_PATTERN);
  if (dayMatch) {
    pushUnique(tradeoffs, {
      dimension: 'TIME',
      direction: 'WORSEN',
      value: Number(dayMatch[1]),
      unit: 'DAY',
      explanation: summary ?? '行程天数增加',
    });
  }

  const hourMatch = text.match(HOUR_PATTERN);
  if (hourMatch && !dayMatch) {
    pushUnique(tradeoffs, {
      dimension: 'TIME',
      direction: text.includes('缩短') || text.includes('降低') ? 'IMPROVE' : 'WORSEN',
      value: Number(hourMatch[1]),
      unit: 'HOUR',
      explanation: text.slice(0, 120),
    });
  }

  const minuteMatch = text.match(MINUTE_PATTERN);
  if (minuteMatch && issueKindImpliesDrive(text)) {
    pushUnique(tradeoffs, {
      dimension: 'FATIGUE',
      direction: text.includes('缩短') ? 'IMPROVE' : 'WORSEN',
      value: Number(minuteMatch[1]),
      unit: 'MINUTE',
      explanation: text.slice(0, 120),
    });
  }

  const currencyMatch = text.match(CURRENCY_PATTERN);
  if (currencyMatch && (text.includes('¥') || text.includes('￥') || text.includes('费用') || text.includes('预算'))) {
    pushUnique(tradeoffs, {
      dimension: 'COST',
      direction: text.includes('节省') || text.includes('降低') ? 'IMPROVE' : 'WORSEN',
      value: Number(currencyMatch[1]),
      unit: 'CURRENCY',
      explanation: text.slice(0, 120),
    });
  }

  const percentMatch = text.match(PERCENT_PATTERN);
  if (percentMatch) {
    const dim: TradeoffDimensionKey = text.includes('疲劳') || text.includes('驾驶') ? 'FATIGUE' : 'CERTAINTY';
    pushUnique(tradeoffs, {
      dimension: dim,
      direction: text.includes('降低') || text.includes('减少') ? 'IMPROVE' : 'WORSEN',
      value: Number(percentMatch[1]),
      unit: 'PERCENT',
      explanation: text.slice(0, 120),
    });
  }

  if (/POI|景点|体验|瀑布|错过/.test(text)) {
    pushUnique(tradeoffs, {
      dimension: 'POI_COVERAGE',
      direction: text.includes('删除') || text.includes('错过') ? 'WORSEN' : 'IMPROVE',
      explanation: text.slice(0, 120),
    });
  }

  if (/安全|风险|F-road|封路|横风/.test(text)) {
    pushUnique(tradeoffs, {
      dimension: 'SAFETY',
      direction: text.includes('更安全') || text.includes('降低风险') ? 'IMPROVE' : 'WORSEN',
      explanation: text.slice(0, 120),
    });
  }

  if (/团队|成员|公平|画像/.test(text)) {
    pushUnique(tradeoffs, {
      dimension: 'GROUP_FAIRNESS',
      direction: 'IMPROVE',
      explanation: text.slice(0, 120),
    });
  }

  if (/预订|预约|取消/.test(text)) {
    pushUnique(tradeoffs, {
      dimension: 'BOOKING_LOSS',
      direction: text.includes('保留') ? 'UNCHANGED' : 'WORSEN',
      explanation: text.slice(0, 120),
    });
  }

  return tradeoffs;
}

function issueKindImpliesDrive(text: string): boolean {
  return /驾驶|行车|drive|路程/.test(text);
}

function readPositiveMinutes(value: unknown): number | undefined {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

function repairActionType(option: RepairOption): string {
  return String(option.actionType ?? '').toLowerCase();
}

/** Batch 1: option-specific deltas already present on repair payloads. */
export function extractTradeoffsFromRepairPayload(
  option: RepairOption,
  issue?: FeasibilityIssueDto,
): TradeoffDimension[] {
  const payload = option.payload;
  if (!payload || typeof payload !== 'object') return [];

  const action = repairActionType(option);
  const tradeoffs: TradeoffDimension[] = [];

  if (isInsertRestDayRepairPayload(payload) || action === 'insert_rest_day') {
    pushUnique(tradeoffs, {
      dimension: 'TIME',
      direction: 'WORSEN',
      value: 1,
      unit: 'DAY',
      explanation: '行程增加 1 天',
    });
    const shortfall = issue?.anchors?.shortfallMinutes;
    if (typeof shortfall === 'number' && shortfall > 0) {
      pushUnique(tradeoffs, {
        dimension: 'FATIGUE',
        direction: 'IMPROVE',
        explanation: '预计消除跨日行程缺口',
      });
    }
    return tradeoffs;
  }

  const bufferMinutes = readPositiveMinutes(payload.bufferMinutes);
  const shiftMinutes = readPositiveMinutes(payload.shiftMinutes);

  if (/shift_departure/.test(action) && shiftMinutes) {
    pushUnique(tradeoffs, {
      dimension: 'TIME',
      direction: 'WORSEN',
      value: shiftMinutes,
      unit: 'MINUTE',
      explanation: `将下一站开始时间延后 ${shiftMinutes} 分钟`,
    });
    const payloadShortfall = readPositiveMinutes(payload.shortfallMinutes);
    if (payloadShortfall) {
      pushUnique(tradeoffs, {
        dimension: 'TIME',
        direction: 'IMPROVE',
        value: payloadShortfall,
        unit: 'MINUTE',
        explanation: `预计弥补约 ${payloadShortfall} 分钟时间缺口`,
      });
    }
    return tradeoffs;
  }

  if (/add_buffer/.test(action) && bufferMinutes) {
    pushUnique(tradeoffs, {
      dimension: 'TIME',
      direction: 'WORSEN',
      value: bufferMinutes,
      unit: 'MINUTE',
      explanation: `出发/开始时间延后 ${bufferMinutes} 分钟`,
    });
    pushUnique(tradeoffs, {
      dimension: 'FATIGUE',
      direction: 'IMPROVE',
      value: bufferMinutes,
      unit: 'MINUTE',
      explanation: `增加 ${bufferMinutes} 分钟衔接缓冲`,
    });
    return tradeoffs;
  }

  if (/shift_earlier|advance_departure|depart_earlier/.test(action) || (typeof payload.shiftMinutes === 'number' && payload.shiftMinutes < 0)) {
    const advance =
      readPositiveMinutes(payload.advanceMinutes) ??
      (typeof payload.shiftMinutes === 'number' && payload.shiftMinutes < 0
        ? Math.abs(Math.round(payload.shiftMinutes))
        : undefined);
    if (advance) {
      pushUnique(tradeoffs, {
        dimension: 'TIME',
        direction: 'IMPROVE',
        value: advance,
        unit: 'MINUTE',
        explanation: `出发时间提前 ${advance} 分钟`,
      });
      const payloadShortfall = readPositiveMinutes(payload.shortfallMinutes);
      if (payloadShortfall) {
        pushUnique(tradeoffs, {
          dimension: 'TIME',
          direction: 'IMPROVE',
          value: payloadShortfall,
          unit: 'MINUTE',
          explanation: `预计弥补约 ${payloadShortfall} 分钟时间缺口`,
        });
      }
      return tradeoffs;
    }
  }

  if (/adjust_time|adjust_schedule/.test(action)) {
    const adjustTradeoffs = extractAdjustTimeTradeoffs(payload, issue);
    if (adjustTradeoffs.length) return adjustTradeoffs;
  }

  if (/relocate_lodging|change_hotel|relocate/.test(action)) {
    return extractRelocateLodgingTradeoffs(option, payload, issue);
  }

  if (/split_day|split_drive|split_journey|split_leg/.test(action)) {
    return extractSplitDayTradeoffs(option, payload, issue);
  }

  if (isRemovePoiRepairAction(action, payload)) {
    return extractRemovePoiTradeoffs(option, payload, issue);
  }

  return tradeoffs;
}

function isRemovePoiRepairAction(action: string, payload: Record<string, unknown>): boolean {
  return (
    /remove_poi|remove_pois|drop_poi|delete_poi/.test(action) ||
    (/remove|skip|delete|drop/.test(action) && typeof payload.itemId === 'string')
  );
}

function readSavedMinutesFromText(text: string): number | undefined {
  const match = text.match(/(?:缩短|减少|节省|降至)(?:约)?\s*(\d+)\s*分钟/);
  if (!match) return undefined;
  return readPositiveMinutes(match[1]);
}

function computeIsoMinuteDelta(before?: string, after?: string): number | undefined {
  if (!before || !after) return undefined;
  const b = DateTime.fromISO(before);
  const a = DateTime.fromISO(after);
  if (!b.isValid || !a.isValid) return undefined;
  return Math.round(a.diff(b, 'minutes').minutes);
}

function extractAdjustTimeTradeoffs(
  payload: Record<string, unknown>,
  issue?: FeasibilityIssueDto,
): TradeoffDimension[] {
  const tradeoffs: TradeoffDimension[] = [];
  const suggested = payload.suggestedValue;
  const suggestedIso = typeof suggested === 'string' ? suggested : undefined;
  const current =
    typeof payload.currentStartTime === 'string'
      ? payload.currentStartTime
      : issue?.anchors?.activityStartAt ?? issue?.anchors?.toTime;
  const explicitShift = typeof payload.shiftMinutes === 'number' ? Math.round(payload.shiftMinutes) : undefined;
  const delta = explicitShift ?? (suggestedIso ? computeIsoMinuteDelta(current, suggestedIso) : undefined);
  if (delta == null || delta === 0) return tradeoffs;

  const minutes = Math.abs(delta);
  pushUnique(tradeoffs, {
    dimension: 'TIME',
    direction: delta > 0 ? 'WORSEN' : 'IMPROVE',
    value: minutes,
    unit: 'MINUTE',
    explanation:
      delta > 0
        ? `开始时间延后 ${minutes} 分钟`
        : `开始时间提前 ${minutes} 分钟`,
  });

  const payloadShortfall = readPositiveMinutes(payload.shortfallMinutes);
  if (payloadShortfall && delta > 0) {
    pushUnique(tradeoffs, {
      dimension: 'TIME',
      direction: 'IMPROVE',
      value: payloadShortfall,
      unit: 'MINUTE',
      explanation: `预计弥补约 ${payloadShortfall} 分钟时间缺口`,
    });
  }
  return tradeoffs;
}

function extractRelocateLodgingTradeoffs(
  option: RepairOption,
  payload: Record<string, unknown>,
  issue?: FeasibilityIssueDto,
): TradeoffDimension[] {
  const tradeoffs: TradeoffDimension[] = [];
  const saved =
    readPositiveMinutes(payload.expectedDriveReductionMinutes ?? payload.savedMinutes) ??
    readSavedMinutesFromText(`${option.description ?? ''} ${option.title}`);

  if (saved) {
    pushUnique(tradeoffs, {
      dimension: 'FATIGUE',
      direction: 'IMPROVE',
      value: saved,
      unit: 'MINUTE',
      explanation: `预计缩短约 ${saved} 分钟驾驶`,
    });
  } else {
    pushUnique(tradeoffs, {
      dimension: 'FATIGUE',
      direction: 'IMPROVE',
      explanation: '预计缩短当日驾驶距离',
    });
  }

  if (option.cost != null && option.cost > 0) {
    pushUnique(tradeoffs, {
      dimension: 'COST',
      direction: 'WORSEN',
      value: option.cost,
      unit: 'CURRENCY',
      explanation: '更换住宿可能产生额外费用',
    });
  }
  return tradeoffs;
}

function extractSplitDayTradeoffs(
  option: RepairOption,
  payload: Record<string, unknown>,
  issue?: FeasibilityIssueDto,
): TradeoffDimension[] {
  const tradeoffs: TradeoffDimension[] = [];
  const saved =
    readPositiveMinutes(payload.expectedDriveReductionMinutes ?? payload.savedMinutes) ??
    readSavedMinutesFromText(`${option.description ?? ''} ${option.title}`);
  const target = readPositiveMinutes(payload.targetTravelMinutes);

  pushUnique(tradeoffs, {
    dimension: 'FLEXIBILITY',
    direction: 'WORSEN',
    explanation: '需调整多日行程分配',
  });

  if (saved) {
    pushUnique(tradeoffs, {
      dimension: 'FATIGUE',
      direction: 'IMPROVE',
      value: saved,
      unit: 'MINUTE',
      explanation: target
        ? `预计当日驾驶降至约 ${target} 分钟`
        : `预计缩短约 ${saved} 分钟驾驶`,
    });
  } else {
    pushUnique(tradeoffs, {
      dimension: 'FATIGUE',
      direction: 'IMPROVE',
      explanation: '预计降低单日驾驶时长',
    });
  }
  return tradeoffs;
}

function extractRemovePoiTradeoffs(
  option: RepairOption,
  payload: Record<string, unknown>,
  issue?: FeasibilityIssueDto,
): TradeoffDimension[] {
  const tradeoffs: TradeoffDimension[] = [];
  const itemLabel =
    (typeof payload.itemLabel === 'string' && payload.itemLabel) ||
    (typeof payload.placeLabel === 'string' && payload.placeLabel) ||
    option.title.replace(/^移除\s*/, '') ||
    '景点';

  pushUnique(tradeoffs, {
    dimension: 'POI_COVERAGE',
    direction: 'WORSEN',
    explanation: `移除 ${itemLabel}`,
  });

  const saved =
    readPositiveMinutes(payload.savedMinutes ?? payload.travelMinutesSaved ?? payload.minutesSaved) ??
    readSavedMinutesFromText(`${option.description ?? ''} ${option.title}`);

  if (saved) {
    const dim = issue?.issueKind === 'daily_drive' ? 'FATIGUE' : 'TIME';
    pushUnique(tradeoffs, {
      dimension: dim,
      direction: 'IMPROVE',
      value: saved,
      unit: 'MINUTE',
      explanation:
        dim === 'FATIGUE'
          ? `预计缩短约 ${saved} 分钟驾驶/行程时间`
          : `预计节省约 ${saved} 分钟`,
    });
  } else {
    pushUnique(tradeoffs, {
      dimension: improveDimensionForIssue(issue),
      direction: 'IMPROVE',
      explanation: '预计缓解交通时间压力（具体幅度取决于移除项）',
    });
  }

  return tradeoffs;
}

function improveDimensionForIssue(issue?: FeasibilityIssueDto): TradeoffDimension['dimension'] {
  return issue?.issueKind === 'daily_drive' ? 'FATIGUE' : 'TIME';
}

export function normalizeRepairOptionTradeoffs(
  option: RepairOption,
  issue?: FeasibilityIssueDto,
  preview?: PreviewRepairResponse | Record<string, unknown>,
): TradeoffDimension[] {
  const fromPayload = extractTradeoffsFromRepairPayload(option, issue);
  if (fromPayload.length > 0) return fromPayload;

  const fromPreview = extractTradeoffsFromRepairPreview(preview, option, issue);
  if (fromPreview.length > 0) return fromPreview;

  const fromSummary = parseImpactSummary(option.impact, `${option.title} ${option.description ?? ''}`);
  if (fromSummary.length > 0) return fromSummary;

  const fallback: TradeoffDimension[] = [];
  const impactLevel = String(option.impact ?? 'medium');
  if (impactLevel === 'high') {
    fallback.push({
      dimension: 'FLEXIBILITY',
      direction: 'WORSEN',
      explanation: option.description ?? option.title,
    });
  }

  const shortfall = issue?.anchors?.shortfallMinutes;
  if (typeof shortfall === 'number' && shortfall > 0) {
    // 无选项专属 delta 时禁止用问题总 shortfall 冒充方案数值（见 DECISION_SEMANTICS_KNOWN_GAPS.md）
    fallback.push({
      dimension: 'FATIGUE',
      direction: 'IMPROVE',
      explanation: '预计缓解交通时间压力（具体幅度取决于本方案）',
    });
  }

  if (option.cost != null && option.cost !== 0) {
    fallback.push({
      dimension: 'COST',
      direction: option.cost > 0 ? 'WORSEN' : 'IMPROVE',
      value: Math.abs(option.cost),
      unit: 'CURRENCY',
      explanation: option.description ?? '费用变化',
    });
  }

  if (!fallback.length) {
    fallback.push({
      dimension: 'CERTAINTY',
      direction: 'IMPROVE',
      explanation: option.description ?? option.title,
    });
  }

  return fallback;
}

export function tradeoffsHaveNumericDelta(tradeoffs: TradeoffDimension[]): boolean {
  return tradeoffs.some((t) => typeof t.value === 'number' && Number.isFinite(t.value));
}

export function inferOptionRequiresConfirmation(
  tradeoffs: TradeoffDimension[],
  issue?: FeasibilityIssueDto,
): boolean {
  if (issue?.priority === 'pending_confirm') return true;
  if (tradeoffs.some((t) => t.dimension === 'COST' && t.direction === 'WORSEN')) return true;
  if (tradeoffs.some((t) => t.dimension === 'BOOKING_LOSS' && t.direction === 'WORSEN')) return true;
  return false;
}
