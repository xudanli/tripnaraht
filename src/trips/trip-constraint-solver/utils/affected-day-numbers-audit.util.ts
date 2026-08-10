/**
 * Audit planning-conflicts affectedDayNumbers for iOS Day-bar highlighting.
 *
 * Rules:
 * - Non-empty days = only those Day numbers should turn red (1-based).
 * - Empty / missing = trip-level; must NOT paint every Day.
 * - Never default-fill 1..N.
 */

import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import { normalizePlanningAffectedDayNumbers } from './planning-conflicts.util';

export type AffectedDaysAuditFinding = {
  conflictId: string;
  title: string;
  days: number[];
  kind:
    | 'ok'
    | 'all_days_filled'
    | 'out_of_range'
    | 'zero_based_suspect'
    | 'high_coverage';
  detail: string;
};

export type AffectedDaysAuditReport = {
  tripDayCount: number;
  conflictCount: number;
  dayScopedCount: number;
  tripLevelCount: number;
  findings: AffectedDaysAuditFinding[];
  /** true when response looks unhealthy for Day highlighting */
  unhealthy: boolean;
};

export function resolveConflictAffectedDayNumbers(
  item: Pick<
    PlanningConflictItem,
    'affectedDayNumbers' | 'affectedDays' | 'issue'
  >,
): number[] {
  return normalizePlanningAffectedDayNumbers({
    affectedDayNumbers: item.affectedDayNumbers ?? item.issue?.affectedDayNumbers,
    affectedDays: item.affectedDays ?? item.issue?.affectedDays,
  });
}

export function auditPlanningConflictsAffectedDays(input: {
  conflicts: PlanningConflictItem[];
  tripDayCount: number;
  /** fraction of day-scoped conflicts covering ≥ this share of trip days */
  highCoverageRatio?: number;
}): AffectedDaysAuditReport {
  const tripDayCount = Math.max(0, input.tripDayCount);
  const highCoverageRatio = input.highCoverageRatio ?? 0.8;
  const findings: AffectedDaysAuditFinding[] = [];
  let dayScopedCount = 0;
  let tripLevelCount = 0;
  let highCoverageHits = 0;

  for (const c of input.conflicts) {
    const days = resolveConflictAffectedDayNumbers(c);
    if (days.length === 0) {
      tripLevelCount += 1;
      findings.push({
        conflictId: c.id,
        title: c.title,
        days,
        kind: 'ok',
        detail: 'trip-level (empty affectedDayNumbers)',
      });
      continue;
    }

    dayScopedCount += 1;

    if (days.includes(0)) {
      findings.push({
        conflictId: c.id,
        title: c.title,
        days,
        kind: 'zero_based_suspect',
        detail: 'contains 0 — iOS Day1 expects 1-based indices',
      });
    }

    const outOfRange = days.filter((d) => d < 1 || (tripDayCount > 0 && d > tripDayCount));
    if (outOfRange.length) {
      findings.push({
        conflictId: c.id,
        title: c.title,
        days,
        kind: 'out_of_range',
        detail: `out of 1..${tripDayCount}: ${outOfRange.join(',')}`,
      });
    }

    if (
      tripDayCount > 1 &&
      days.length === tripDayCount &&
      days.every((d, i) => d === i + 1)
    ) {
      findings.push({
        conflictId: c.id,
        title: c.title,
        days,
        kind: 'all_days_filled',
        detail: 'filled with every trip day — Day bar will be all red',
      });
    } else if (tripDayCount > 0 && days.length / tripDayCount >= highCoverageRatio) {
      highCoverageHits += 1;
      findings.push({
        conflictId: c.id,
        title: c.title,
        days,
        kind: 'high_coverage',
        detail: `covers ${days.length}/${tripDayCount} days (≥${Math.round(highCoverageRatio * 100)}%)`,
      });
    } else {
      findings.push({
        conflictId: c.id,
        title: c.title,
        days,
        kind: 'ok',
        detail: `highlight Day ${days.join(',')}`,
      });
    }
  }

  const bad = findings.filter((f) => f.kind !== 'ok' && f.kind !== 'high_coverage');
  const highCoverageMajority =
    dayScopedCount > 0 && highCoverageHits / dayScopedCount > 0.5;

  return {
    tripDayCount,
    conflictCount: input.conflicts.length,
    dayScopedCount,
    tripLevelCount,
    findings,
    unhealthy: bad.length > 0 || highCoverageMajority,
  };
}

/** One-line dump for manual QA: conflictId | title | days | expected red Days */
export function formatAffectedDaysAuditLines(
  report: AffectedDaysAuditReport,
): string[] {
  return report.findings.map(
    (f) =>
      `${f.conflictId} | ${f.title} | [${f.days.join(',')}] | ${f.detail}`,
  );
}
