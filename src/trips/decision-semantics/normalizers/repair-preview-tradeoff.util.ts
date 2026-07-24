/**
 * Derive option-specific tradeoffs from repair preview before/after (batch 2).
 */

import type { PreviewRepairResponse } from '../../readiness/types/coverage-map.types';
import type { RepairOption } from '../../readiness/types/coverage-map.types';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type { TradeoffDimension } from '../types/decision-semantics.types';

const HIGHLIGHT_SHIFT_PATTERN = /\+\s*(\d+)\s*分钟/;
const HIGHLIGHT_DAY_PATTERN = /总天数\s*(\d+)/;
const BEFORE_DAY_PATTERN = /当前共\s*(\d+)\s*天/;

function pushUnique(tradeoffs: TradeoffDimension[], item: TradeoffDimension): void {
  const exists = tradeoffs.some(
    (t) => t.dimension === item.dimension && t.direction === item.direction && t.explanation === item.explanation,
  );
  if (!exists) tradeoffs.push(item);
}

export function parseHmToMinutes(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
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

function slotDurationMinutes(slot?: Record<string, unknown>): number | undefined {
  if (!slot) return undefined;
  const start = parseHmToMinutes(slot.time);
  const end = parseHmToMinutes(slot.endTime);
  if (start == null || end == null || end <= start) return undefined;
  return end - start;
}

function isRemovePoiAction(action: string): boolean {
  return /remove_poi|remove_pois|drop_poi|delete_poi/.test(action);
}

function isDriveIssue(issue?: FeasibilityIssueDto): boolean {
  return issue?.issueKind === 'daily_drive' || issue?.category === 'transport';
}

function improveDimensionForSavedMinutes(issue?: FeasibilityIssueDto): 'FATIGUE' | 'TIME' {
  return isDriveIssue(issue) ? 'FATIGUE' : 'TIME';
}

export function extractTradeoffsFromRepairPreview(
  preview: PreviewRepairResponse | Record<string, unknown> | undefined,
  option: RepairOption,
  issue?: FeasibilityIssueDto,
): TradeoffDimension[] {
  if (!preview || typeof preview !== 'object') return [];

  const typed = preview as PreviewRepairResponse;
  const action = String(option.actionType ?? typed.actionType ?? '').toLowerCase();
  const payload = (option.payload ?? typed.option?.payload ?? {}) as Record<string, unknown>;
  const tradeoffs: TradeoffDimension[] = [];

  for (const entry of typed.itineraryDiff ?? []) {
    if (entry.changeType === 'time_changed') {
      const beforeMin = parseHmToMinutes(entry.before?.time);
      const afterMin = parseHmToMinutes(entry.after?.time);
      if (beforeMin == null || afterMin == null) continue;
      const delta = afterMin - beforeMin;
      if (delta === 0) continue;
      pushUnique(tradeoffs, {
        dimension: 'TIME',
        direction: delta > 0 ? 'WORSEN' : 'IMPROVE',
        value: Math.abs(delta),
        unit: 'MINUTE',
        explanation:
          delta > 0
            ? `${entry.after?.title ?? '行程项'} 开始时间延后 ${Math.abs(delta)} 分钟`
            : `${entry.after?.title ?? '行程项'} 开始时间提前 ${Math.abs(delta)} 分钟`,
      });
      continue;
    }

    if (entry.changeType === 'removed') {
      const title = String(entry.before?.title ?? entry.slotId);
      pushUnique(tradeoffs, {
        dimension: 'POI_COVERAGE',
        direction: 'WORSEN',
        explanation: `移除 ${title}`,
      });

      const payloadSaved = readPositiveMinutes(
        payload.savedMinutes ?? payload.travelMinutesSaved ?? payload.minutesSaved,
      );
      const durationSaved = slotDurationMinutes(entry.before);
      const saved = payloadSaved ?? durationSaved;
      if (saved && (isRemovePoiAction(action) || /remove|skip|delete|drop/.test(action))) {
        const dim = improveDimensionForSavedMinutes(issue);
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
      }
    }
  }

  if (!tradeoffs.length) {
    const afterHighlight = typed.after?.highlights?.find((h) => HIGHLIGHT_SHIFT_PATTERN.test(h));
    const shiftMatch = afterHighlight?.match(HIGHLIGHT_SHIFT_PATTERN);
    if (shiftMatch) {
      const minutes = Number(shiftMatch[1]);
      if (minutes > 0) {
        pushUnique(tradeoffs, {
          dimension: 'TIME',
          direction: 'WORSEN',
          value: minutes,
          unit: 'MINUTE',
          explanation: `将下一站开始时间延后 ${minutes} 分钟`,
        });
      }
    }
  }

  const beforeDayText = typed.before?.highlights?.find((h) => BEFORE_DAY_PATTERN.test(h));
  const afterDayText = typed.after?.highlights?.find((h) => HIGHLIGHT_DAY_PATTERN.test(h));
  const beforeDays = beforeDayText?.match(BEFORE_DAY_PATTERN)?.[1];
  const afterDays = afterDayText?.match(HIGHLIGHT_DAY_PATTERN)?.[1];
  if (beforeDays && afterDays && Number(afterDays) > Number(beforeDays)) {
    pushUnique(tradeoffs, {
      dimension: 'TIME',
      direction: 'WORSEN',
      value: Number(afterDays) - Number(beforeDays),
      unit: 'DAY',
      explanation: `行程增加 ${Number(afterDays) - Number(beforeDays)} 天`,
    });
  }

  if (
    !tradeoffs.some((t) => t.unit === 'DAY') &&
    typeof typed.before?.totalItemCount === 'number' &&
    typeof typed.after?.totalItemCount === 'number' &&
    typed.after.totalItemCount > typed.before.totalItemCount &&
    (action === 'insert_rest_day' || /insert_rest|add_buffer/.test(action))
  ) {
    pushUnique(tradeoffs, {
      dimension: 'TIME',
      direction: 'WORSEN',
      value: 1,
      unit: 'DAY',
      explanation: '行程增加 1 天',
    });
  }

  return tradeoffs;
}
