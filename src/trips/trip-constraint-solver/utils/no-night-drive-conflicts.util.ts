import { DateTime } from 'luxon';
import SunCalc from 'suncalc';
import {
  ConflictDto,
  ConflictSeverity,
  ConflictType,
} from '../../dto/trip-conflicts.dto';
import type { NoNightDrivePolicy } from './daily-drive-threshold.util';
import { formatDriveDurationZhLong } from './daily-drive-threshold.util';
import type { ConstraintScopeBinding } from '../types/trip-constraint.types';
import {
  constraintAppliesInContext,
  evaluationContextFromConflictDay,
} from './constraint-scope-binding.util';

const ZONE = 'Atlantic/Reykjavik';
const DEFAULT_COORDS = { lat: 64.1466, lng: -21.9426 };

export function resolveDrivingCutoffDateTime(
  dateIso: string,
  maxMinutesAfterSunset: number,
  lat?: number,
  lng?: number,
): DateTime | undefined {
  const la = typeof lat === 'number' ? lat : DEFAULT_COORDS.lat;
  const ln = typeof lng === 'number' ? lng : DEFAULT_COORDS.lng;
  const day = dateIso.slice(0, 10);
  const dt = DateTime.fromISO(day, { zone: ZONE });
  if (!dt.isValid) return undefined;
  const base = dt.set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toUTC().toJSDate();
  const times = SunCalc.getTimes(base, la, ln);
  if (!times.sunset || Number.isNaN(times.sunset.getTime())) return undefined;
  const sunset = DateTime.fromJSDate(times.sunset, { zone: 'UTC' }).setZone(ZONE);
  return sunset.plus({ minutes: maxMinutesAfterSunset });
}

export function isDrivingAfterNightCutoff(input: {
  departAt: DateTime;
  arriveAt: DateTime;
  maxMinutesAfterSunset: number;
  lat?: number;
  lng?: number;
}): {
  violated: boolean;
  cutoff?: DateTime;
  sunset?: DateTime;
  dateIso?: string;
} {
  const dateIso = input.departAt.setZone(ZONE).toISODate();
  if (!dateIso) return { violated: false };
  const cutoff = resolveDrivingCutoffDateTime(
    dateIso,
    input.maxMinutesAfterSunset,
    input.lat,
    input.lng,
  );
  if (!cutoff) return { violated: false, dateIso };
  const sunset = cutoff.minus({ minutes: input.maxMinutesAfterSunset });
  return {
    violated: input.arriveAt > cutoff,
    cutoff,
    sunset,
    dateIso,
  };
}

export function buildNoNightDriveViolationConflict(input: {
  id: string;
  dayNumber: number;
  dateIso: string;
  fromItemId: string;
  toItemId: string;
  fromName: string;
  toName: string;
  departAt: DateTime;
  arriveAt: DateTime;
  cutoff: DateTime;
  sunset: DateTime;
  maxMinutesAfterSunset: number;
  travelMinutes: number;
}): ConflictDto {
  const cutoffLabel = input.cutoff.toFormat('HH:mm');
  const sunsetLabel = input.sunset.toFormat('HH:mm');
  const judgmentRule = `日落后 ${input.maxMinutesAfterSunset} 分钟不得继续驾驶`;
  return {
    id: input.id,
    type: ConflictType.NO_NIGHT_DRIVE_VIOLATION,
    severity: ConflictSeverity.HIGH,
    title: '不夜驾',
    description: `${judgmentRule}。Day ${input.dayNumber}「${input.fromName} → ${input.toName}」预计 ${input.arriveAt.toFormat('HH:mm')} 抵达，晚于截止 ${cutoffLabel}（日落 ${sunsetLabel}）。驾驶约 ${formatDriveDurationZhLong(input.travelMinutes)}。`,
    affectedDays: [String(input.dayNumber)],
    affectedItemIds: [input.fromItemId, input.toItemId],
    fromItemId: input.fromItemId,
    toItemId: input.toItemId,
    fromPlaceLabel: input.fromName,
    toPlaceLabel: input.toName,
    fromDayNumber: input.dayNumber,
    toDayNumber: input.dayNumber,
    issueKind: 'no_night_drive',
    priority: 'must_handle',
    travelMode: 'DRIVING',
    travelMinutes: input.travelMinutes,
    travelTimeMinutes: input.travelMinutes,
    departAt: input.departAt.toISO() ?? undefined,
    arriveAt: input.arriveAt.toISO() ?? undefined,
    suggestions: [
      {
        action: '提前出发或缩短当日行程',
        description: `将驾驶段改到 ${cutoffLabel} 前结束，或增加中途住宿`,
        impact: judgmentRule,
      },
    ],
  };
}

export function maybeBuildNoNightDriveConflict(input: {
  policy: NoNightDrivePolicy;
  idPrefix: string;
  dayNumber: number;
  dateIso: string;
  fromItemId: string;
  toItemId: string;
  fromName: string;
  toName: string;
  departAt: DateTime;
  arriveAt: DateTime;
  travelMinutes: number;
  travelMode: string;
  lat?: number;
  lng?: number;
  scopeBinding?: ConstraintScopeBinding;
}): ConflictDto | undefined {
  if (input.travelMode !== 'DRIVING') return undefined;
  if (
    input.scopeBinding &&
    !constraintAppliesInContext(
      input.scopeBinding,
      evaluationContextFromConflictDay({
        dayNumber: input.dayNumber,
        fromItemId: input.fromItemId,
        toItemId: input.toItemId,
        phase: 'planning',
      }),
    )
  ) {
    return undefined;
  }
  const check = isDrivingAfterNightCutoff({
    departAt: input.departAt,
    arriveAt: input.arriveAt,
    maxMinutesAfterSunset: input.policy.maxMinutesAfterSunset,
    lat: input.lat,
    lng: input.lng,
  });
  if (!check.violated || !check.cutoff || !check.sunset) return undefined;
  return buildNoNightDriveViolationConflict({
    id: `${input.idPrefix}-${input.fromItemId}-${input.toItemId}`,
    dayNumber: input.dayNumber,
    dateIso: input.dateIso,
    fromItemId: input.fromItemId,
    toItemId: input.toItemId,
    fromName: input.fromName,
    toName: input.toName,
    departAt: input.departAt,
    arriveAt: input.arriveAt,
    cutoff: check.cutoff,
    sunset: check.sunset,
    maxMinutesAfterSunset: input.policy.maxMinutesAfterSunset,
    travelMinutes: input.travelMinutes,
  });
}
