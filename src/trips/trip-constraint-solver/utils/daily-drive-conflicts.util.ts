import {
  ConflictDto,
  ConflictSeverity,
  ConflictType,
} from '../../dto/trip-conflicts.dto';
import {
  formatDriveDurationZh,
  formatDriveDurationZhLong,
} from './daily-drive-threshold.util';

export interface DailyDriveLegRecord {
  fromItemId?: string;
  toItemId?: string;
  fromPlaceLabel?: string;
  toPlaceLabel?: string;
  travelMinutes: number;
  departAt?: string;
}

export function accumulateDailyDrivingMinutes(
  accumulator: Map<number, number>,
  dayNumber: number,
  travelMinutes: number,
  travelMode: string | undefined,
): void {
  if (travelMode !== 'DRIVING') return;
  if (!Number.isFinite(travelMinutes) || travelMinutes <= 0) return;
  accumulator.set(dayNumber, (accumulator.get(dayNumber) ?? 0) + travelMinutes);
}

export function recordDailyDrivingLeg(
  dailyDriveMinutes: Map<number, number>,
  dailyDriveLegs: Map<number, DailyDriveLegRecord[]>,
  dayNumber: number,
  leg: DailyDriveLegRecord,
  travelMode: string | undefined,
): void {
  accumulateDailyDrivingMinutes(
    dailyDriveMinutes,
    dayNumber,
    leg.travelMinutes,
    travelMode,
  );
  if (travelMode !== 'DRIVING') return;
  if (!Number.isFinite(leg.travelMinutes) || leg.travelMinutes <= 0) return;
  const bucket = dailyDriveLegs.get(dayNumber) ?? [];
  bucket.push(leg);
  dailyDriveLegs.set(dayNumber, bucket);
}

function pickPrimaryDriveLeg(legs: DailyDriveLegRecord[]): DailyDriveLegRecord | undefined {
  if (!legs.length) return undefined;
  return [...legs].sort((a, b) => b.travelMinutes - a.travelMinutes)[0];
}

export function buildDailyDriveExceededConflicts(input: {
  dailyDriveMinutes: Map<number, number>;
  maxDailyDrivingHours: number;
  dayItemIds?: Map<number, string[]>;
  dayLegs?: Map<number, DailyDriveLegRecord[]>;
  /** scopeBinding 过滤 — 仅对适用天数生成冲突 */
  shouldApplyToDay?: (dayNumber: number) => boolean;
}): ConflictDto[] {
  const maxMinutes = input.maxDailyDrivingHours * 60;
  const conflicts: ConflictDto[] = [];

  for (const [dayNumber, driveMinutes] of [...input.dailyDriveMinutes.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    if (input.shouldApplyToDay && !input.shouldApplyToDay(dayNumber)) continue;
    if (driveMinutes <= maxMinutes) continue;
    const shortfallMinutes = Math.ceil(driveMinutes - maxMinutes);
    const affectedItemIds = input.dayItemIds?.get(dayNumber) ?? [];
    const legs = input.dayLegs?.get(dayNumber) ?? [];
    const primaryLeg = pickPrimaryDriveLeg(legs);
    conflicts.push({
      id: `daily-drive-day-${dayNumber}`,
      type: ConflictType.MAX_DAILY_DRIVE_EXCEEDED,
      severity: ConflictSeverity.HIGH,
      title: '每日驾驶上限',
      description: `Day ${dayNumber} 连续驾驶时长 ${formatDriveDurationZhLong(driveMinutes)}，超过每日上限 ${input.maxDailyDrivingHours} 小时，超出 ${formatDriveDurationZhLong(shortfallMinutes)}。`,
      affectedDays: [String(dayNumber)],
      affectedItemIds,
      issueKind: 'daily_drive',
      priority: 'must_handle',
      fromDayNumber: dayNumber,
      toDayNumber: dayNumber,
      fromItemId: primaryLeg?.fromItemId,
      toItemId: primaryLeg?.toItemId,
      fromPlaceLabel: primaryLeg?.fromPlaceLabel,
      toPlaceLabel: primaryLeg?.toPlaceLabel,
      departAt: primaryLeg?.departAt,
      travelMinutes: driveMinutes,
      travelTimeMinutes: primaryLeg?.travelMinutes ?? driveMinutes,
      shortfallMinutes,
      dailyDriveLegs: legs.length ? legs : undefined,
      suggestions: [
        {
          action: '拆分行程或增加中途住宿',
          description: '减少当日总驾驶时长，或把部分路段挪到相邻日期',
          impact: '满足每日驾驶上限，降低疲劳与安全风险',
        },
      ],
    });
  }

  return conflicts;
}
