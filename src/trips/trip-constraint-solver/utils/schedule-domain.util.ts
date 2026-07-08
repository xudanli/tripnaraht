/**
 * Schedule / transport timing domain — shared for Gateway PLAN_VERIFY projection (Phase 2b).
 */

import { ConflictDto, ConflictType } from '../../dto/trip-conflicts.dto';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import { isBufferInsufficientConflict } from './buffer-insufficient-repair.util';

export function isTravelTimingConflict(c: ConflictDto): boolean {
  return (
    c.issueKind === 'same_day_travel' ||
    c.issueKind === 'inter_day_travel' ||
    c.id.startsWith('same-day-travel-') ||
    c.id.startsWith('inter-day-travel-')
  );
}

export function isDailyDriveConflict(c: ConflictDto): boolean {
  return c.issueKind === 'daily_drive' || c.type === ConflictType.MAX_DAILY_DRIVE_EXCEEDED;
}

export function isNoNightDriveConflict(c: ConflictDto): boolean {
  return c.issueKind === 'no_night_drive' || c.type === ConflictType.NO_NIGHT_DRIVE_VIOLATION;
}

export function isScheduleDomainConflict(c: ConflictDto): boolean {
  return (
    isDailyDriveConflict(c) ||
    isNoNightDriveConflict(c) ||
    isTravelTimingConflict(c) ||
    isBufferInsufficientConflict(c)
  );
}

export function isScheduleDomainIssue(issue: FeasibilityIssueDto): boolean {
  return (
    issue.issueKind === 'daily_drive' ||
    issue.issueKind === 'no_night_drive' ||
    issue.issueKind === 'inter_day_travel' ||
    issue.issueKind === 'same_day_travel' ||
    issue.issueKind === 'buffer_insufficient' ||
    issue.category === 'schedule'
  );
}

export function splitConflictsByScheduleDomain(conflicts: ConflictDto[]): {
  schedule: ConflictDto[];
  nonSchedule: ConflictDto[];
} {
  const schedule: ConflictDto[] = [];
  const nonSchedule: ConflictDto[] = [];
  for (const c of conflicts) {
    if (isScheduleDomainConflict(c)) schedule.push(c);
    else nonSchedule.push(c);
  }
  return { schedule, nonSchedule };
}
