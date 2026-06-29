import {
  ConflictDto,
  ConflictSeverity,
  ConflictType,
} from '../../dto/trip-conflicts.dto';
import {
  formatDriveDurationZh,
  formatDriveDurationZhLong,
} from './daily-drive-threshold.util';

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

export function buildDailyDriveExceededConflicts(input: {
  dailyDriveMinutes: Map<number, number>;
  maxDailyDrivingHours: number;
  dayItemIds?: Map<number, string[]>;
}): ConflictDto[] {
  const maxMinutes = input.maxDailyDrivingHours * 60;
  const conflicts: ConflictDto[] = [];

  for (const [dayNumber, driveMinutes] of [...input.dailyDriveMinutes.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    if (driveMinutes <= maxMinutes) continue;
    const shortfallMinutes = Math.ceil(driveMinutes - maxMinutes);
    const affectedItemIds = input.dayItemIds?.get(dayNumber) ?? [];
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
      travelMinutes: driveMinutes,
      travelTimeMinutes: driveMinutes,
      shortfallMinutes,
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
