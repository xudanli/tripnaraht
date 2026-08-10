import { DateTime } from 'luxon';
import { formatClockLabel } from '../../../common/utils/format-clock-label.util';
import type { ConflictDto } from '../../dto/trip-conflicts.dto';
import { ConflictType } from '../../dto/trip-conflicts.dto';
import type {
  PlanningDecisionBasis,
  PlanningDecisionBasisField,
  PlanningWhatHappened,
} from '../types/planning-decision-basis.types';
import { expandConflictLookupIds } from './resolve-conflict-lookup-ids.util';

const TRANSPORT_TYPES = new Set([
  ConflictType.TRANSPORT_INSUFFICIENT,
  ConflictType.TRANSPORT_TOO_LONG,
  ConflictType.BUFFER_INSUFFICIENT,
]);

export function pickPrimaryConflict(
  conflicts: ConflictDto[],
  conflictId?: string,
  lookupIds?: string[],
): ConflictDto | undefined {
  const ids =
    lookupIds && lookupIds.length > 0
      ? lookupIds
      : conflictId
        ? expandConflictLookupIds(conflictId)
        : [];
  if (ids.length > 0) {
    for (const id of ids) {
      const hit = conflicts.find((c) => c.id === id);
      if (hit) return hit;
    }
    return undefined;
  }
  return (
    conflicts.find((c) => c.type === ConflictType.TRANSPORT_INSUFFICIENT) ??
    conflicts.find((c) => c.type === ConflictType.BUFFER_INSUFFICIENT) ??
    conflicts.find((c) => TRANSPORT_TYPES.has(c.type)) ??
    conflicts[0]
  );
}

function formatMinutesLabel(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} 分钟`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

function formatTimeHm(isoOrDate: Date | string, zone = 'utc'): string {
  return formatClockLabel(isoOrDate, { timezone: zone });
}

export function buildWhatHappenedFromConflict(conflict: ConflictDto): PlanningWhatHappened {
  const dayIndex = conflict.toDayNumber ?? conflict.fromDayNumber;
  const headline = '发生了什么？';

  if (TRANSPORT_TYPES.has(conflict.type)) {
    const day = dayIndex ?? 1;
    const from = conflict.fromPlaceLabel?.trim() || '起点';
    const to = conflict.toPlaceLabel?.trim() || '终点';
    const dist =
      typeof conflict.distanceKm === 'number'
        ? `（约 ${conflict.distanceKm.toFixed(1)} km）`
        : '';
    const travelMin = conflict.travelMinutes ?? conflict.travelTimeMinutes;
    const bufferMin = conflict.gapMinutes ?? conflict.availableMinutes;

    let narrative = conflict.description?.trim() || '';
    if (travelMin != null && bufferMin != null) {
      narrative = `第${day}天：${from} -> ${to} ${dist}：预计需要 ${formatMinutesLabel(travelMin)}，原计划仅预留 ${formatMinutesLabel(bufferMin)}缓冲。`;
    } else if (!narrative) {
      narrative = `第${day}天：${from} -> ${to} ${dist}：交通衔接时间不足。`;
    }

    return { headline, narrative, conflictId: conflict.id, dayIndex: day };
  }

  return {
    headline,
    narrative: conflict.description?.trim() || conflict.title,
    conflictId: conflict.id,
    dayIndex,
  };
}

export interface ItemContextInput {
  id: string;
  placeId?: number | null;
  type: string;
  note?: string | null;
  startTime?: Date | null;
  endTime?: Date | null;
  bookingStatus?: string | null;
  bookingConfirmation?: string | null;
  bookedAt?: Date | null;
  isPaid?: boolean;
  Place?: { nameCN?: string | null; nameEN?: string | null } | null;
}

export function buildContextFields(input: {
  conflict: ConflictDto;
  fromItem?: ItemContextInput;
  toItem?: ItemContextInput;
  lunchItem?: ItemContextInput;
  dataValidUntil?: string;
  updatedAt?: string;
}): PlanningDecisionBasisField[] {
  const fields: PlanningDecisionBasisField[] = [];
  const { conflict } = input;

  const travelMin = conflict.travelMinutes ?? conflict.travelTimeMinutes;
  if (travelMin != null) {
    fields.push({
      id: 'field_travel_time',
      key: 'estimated_travel_minutes',
      label: '道路预计耗时',
      value: formatMinutesLabel(travelMin),
      subtext: conflict.timingSource === 'computed' ? '含当前路况修正' : undefined,
      icon: 'travel_time',
      tone: 'good',
    });
  }

  const bufferMin = conflict.gapMinutes ?? conflict.availableMinutes;
  if (bufferMin != null) {
    fields.push({
      id: 'field_planned_buffer',
      key: 'planned_buffer_minutes',
      label: '原计划缓冲',
      value: formatMinutesLabel(bufferMin),
      icon: 'buffer',
      tone: 'neutral',
    });
  }

  if (input.fromItem) {
    const dwell = dwellMinutes(input.fromItem);
    const label = placeLabel(input.fromItem);
    fields.push({
      id: 'field_from_dwell',
      key: 'from_dwell',
      label: `${shortPlaceName(label)}停留`,
      value: dwell != null ? formatMinutesLabel(dwell) : '—',
      subtext: dwellSubtext(input.fromItem),
      icon: 'dwell',
      tone: 'neutral',
      itemId: input.fromItem.id,
      placeId: input.fromItem.placeId ?? undefined,
    });
  }

  if (input.toItem) {
    const res = reservationView(input.toItem);
    const label = placeLabel(input.toItem);
    fields.push({
      id: 'field_to_reservation',
      key: 'to_reservation',
      label: `${shortPlaceName(label)}预约`,
      value: res.value,
      subtext: res.subtext,
      icon: 'reservation',
      tone: res.tone,
      itemId: input.toItem.id,
      placeId: input.toItem.placeId ?? undefined,
    });
  }

  if (input.lunchItem) {
    const lunch = lunchView(input.lunchItem);
    fields.push({
      id: 'field_lunch',
      key: 'lunch_reservation',
      label: '午餐预约',
      value: lunch.value,
      subtext: lunch.subtext,
      icon: 'lunch',
      tone: lunch.tone,
      itemId: input.lunchItem.id,
      placeId: input.lunchItem.placeId ?? undefined,
    });
  } else if (conflict.type === ConflictType.LUNCH_MISSING || conflict.type === ConflictType.LUNCH_WINDOW) {
    fields.push({
      id: 'field_lunch',
      key: 'lunch_reservation',
      label: '午餐预约',
      value: '未安排',
      subtext: '建议尽快预订',
      icon: 'lunch',
      tone: 'warn',
    });
  }

  if (input.dataValidUntil || input.updatedAt) {
    fields.push({
      id: 'field_validity',
      key: 'data_validity',
      label: '数据有效期',
      value: formatValidityDisplay(input.dataValidUntil),
      subtext: input.updatedAt
        ? `更新于 ${formatTimeHm(input.updatedAt)}`
        : undefined,
      icon: 'validity',
      tone: 'neutral',
    });
  }

  return fields;
}

function placeLabel(item: ItemContextInput): string {
  return (
    item.Place?.nameCN?.trim() ||
    item.Place?.nameEN?.trim() ||
    item.note?.trim() ||
    '活动'
  );
}

function shortPlaceName(name: string): string {
  return name.length > 8 ? name.slice(0, 8) : name;
}

function dwellMinutes(item: ItemContextInput): number | null {
  if (!item.startTime || !item.endTime) return null;
  const start = DateTime.fromJSDate(item.startTime, { zone: 'utc' });
  const end = DateTime.fromJSDate(item.endTime, { zone: 'utc' });
  return Math.max(0, Math.round(end.diff(start, 'minutes').minutes));
}

function dwellSubtext(item: ItemContextInput): string | undefined {
  if (item.type === 'MEAL_ANCHOR' || item.type === 'MEAL_FLOATING') return '用餐时段';
  if (item.bookingStatus || item.bookingConfirmation) return '已确认预订';
  return '成员共同选择';
}

function reservationView(item: ItemContextInput): {
  value: string;
  subtext?: string;
  tone: PlanningDecisionBasisField['tone'];
} {
  const booked =
    Boolean(item.bookingConfirmation?.trim()) ||
    item.bookingStatus === 'confirmed' ||
    item.bookingStatus === 'booked' ||
    item.isPaid === true;

  if (booked) {
    const time =
      item.startTime != null ? formatTimeHm(item.startTime) : undefined;
    return {
      value: time ?? '已预订',
      subtext: '已预订',
      tone: 'good',
    };
  }

  const flexTypes = new Set(['ACTIVITY', 'MEAL_FLOATING', 'CUSTOM']);
  if (flexTypes.has(item.type) || !item.bookingStatus) {
    return { value: '无预约', subtext: '可灵活调整', tone: 'neutral' };
  }

  return { value: '待确认', subtext: '建议核对预约状态', tone: 'warn' };
}

function lunchView(item: ItemContextInput): {
  value: string;
  subtext?: string;
  tone: PlanningDecisionBasisField['tone'];
} {
  const time = item.startTime ? formatTimeHm(item.startTime) : undefined;
  const booked =
    Boolean(item.bookingConfirmation?.trim()) ||
    item.bookingStatus === 'confirmed' ||
    item.bookingStatus === 'booked';

  if (time && booked) {
    return { value: time, subtext: '已预订', tone: 'good' };
  }
  if (time) {
    return { value: time, subtext: '时段已排', tone: 'neutral' };
  }
  return { value: '未安排', subtext: '建议预订', tone: 'warn' };
}

function formatValidityDisplay(iso?: string): string {
  if (!iso) return '—';
  const dt = DateTime.fromISO(iso, { zone: 'utc' });
  const now = DateTime.utc();
  if (dt.hasSame(now, 'day')) {
    return `今天 ${dt.toFormat('HH:mm')}`;
  }
  return dt.toFormat('MM-dd HH:mm');
}

export function buildPlanningDecisionBasis(input: {
  tripId: string;
  conflict?: ConflictDto;
  /** Decision-space problem narrative when focus is dc_* / dp_* without a trip-conflict row. */
  problemWhatHappened?: PlanningWhatHappened;
  problemId?: string;
  contextFields: PlanningDecisionBasisField[];
  proposalId?: string;
  optionCount?: number;
  dataValidUntil?: string;
  updatedAt?: string;
}): PlanningDecisionBasis {
  const conflictId = input.conflict?.id;
  const query = new URLSearchParams();
  if (conflictId) query.set('conflictId', conflictId);
  if (input.problemId) query.set('problemId', input.problemId);
  if (input.proposalId) query.set('proposalId', input.proposalId);
  const qs = query.toString();
  const refreshUrl = `/api/trips/${input.tripId}/arrange-itinerary/decision-basis${qs ? `?${qs}` : ''}`;

  const whatHappened = input.conflict
    ? buildWhatHappenedFromConflict(input.conflict)
    : input.problemWhatHappened ?? {
        headline: '发生了什么？',
        narrative: '当前行程未发现需解释的冲突。',
      };

  return {
    schema: 'tripnara.planning_decision_basis@v1',
    tripId: input.tripId,
    conflictId,
    proposalId: input.proposalId,
    generatedAt: new Date().toISOString(),
    whatHappened,
    contextFields: input.contextFields,
    dataValidUntil: input.dataValidUntil,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    optionCount: input.optionCount,
    refreshUrl,
  };
}
