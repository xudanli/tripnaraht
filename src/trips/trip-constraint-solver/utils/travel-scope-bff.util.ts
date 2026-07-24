/**
 * BFF 稳定字段：`same_day_travel` / `transfer_buffer`（`buffer_insufficient`）的
 * `affectedDayNumbers` + `affectedScopeSummary`。
 */

import type { ConflictDto } from '../../dto/trip-conflicts.dto';
import { ConflictType } from '../../dto/trip-conflicts.dto';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';

export const TRAVEL_SCOPE_BFF_ISSUE_KINDS = new Set([
  'same_day_travel',
  'buffer_insufficient',
  'transfer_buffer',
]);

export interface TravelScopeBffFields {
  affectedDayNumbers?: number[];
  affectedScopeSummary?: string;
}

export function shouldEnrichTravelScopeBff(issueKind?: string): boolean {
  return issueKind != null && TRAVEL_SCOPE_BFF_ISSUE_KINDS.has(issueKind);
}

export function buildAffectedScopeSummary(
  fromLabel?: string,
  toLabel?: string,
): string | undefined {
  const from = fromLabel?.trim();
  const to = toLabel?.trim();
  if (from && to) return `${from} → ${to}`;
  if (from) return from;
  if (to) return to;
  return undefined;
}

export function normalizeAffectedDayNumbers(input: {
  affectedDays?: number[];
  fromDayNumber?: number;
  toDayNumber?: number;
}): number[] {
  const days = new Set<number>();
  for (const day of input.affectedDays ?? []) {
    if (Number.isFinite(day) && day > 0) days.add(day);
  }
  if (input.fromDayNumber != null && input.fromDayNumber > 0) {
    days.add(input.fromDayNumber);
  }
  if (input.toDayNumber != null && input.toDayNumber > 0) {
    days.add(input.toDayNumber);
  }
  return [...days].sort((a, b) => a - b);
}

export function parseScopeSummaryFromMessage(message?: string): string | undefined {
  if (!message) return undefined;
  const arrowSegment = message.match(/([^·]+→[^（(]+)/);
  if (!arrowSegment) return undefined;
  return arrowSegment[1].replace(/^第\d+天\s*[·•]\s*/, '').trim() || undefined;
}

export function resolveTravelScopeIssueKind(input: {
  issueKind?: string;
  conflictType?: ConflictType;
}): string | undefined {
  if (input.issueKind === 'transfer_buffer' || input.issueKind === 'buffer_insufficient') {
    return 'buffer_insufficient';
  }
  if (input.issueKind) return input.issueKind;
  if (input.conflictType === ConflictType.BUFFER_INSUFFICIENT) {
    return 'buffer_insufficient';
  }
  return undefined;
}

export function buildTravelScopeBffFields(input: {
  issueKind?: string;
  affectedDays?: number[];
  message?: string;
  anchors?: FeasibilityIssueDto['anchors'];
  fromPlaceLabel?: string;
  toPlaceLabel?: string;
  fromDayNumber?: number;
  toDayNumber?: number;
}): TravelScopeBffFields | undefined {
  const issueKind = resolveTravelScopeIssueKind({ issueKind: input.issueKind });
  if (!shouldEnrichTravelScopeBff(issueKind)) {
    return undefined;
  }

  const affectedDayNumbers = normalizeAffectedDayNumbers({
    affectedDays: input.affectedDays,
    fromDayNumber: input.fromDayNumber ?? input.anchors?.fromDayNumber,
    toDayNumber: input.toDayNumber ?? input.anchors?.toDayNumber,
  });

  const fromLabel = input.anchors?.fromPlaceLabel ?? input.fromPlaceLabel;
  const toLabel = input.anchors?.toPlaceLabel ?? input.toPlaceLabel;
  const affectedScopeSummary =
    buildAffectedScopeSummary(fromLabel, toLabel) ??
    parseScopeSummaryFromMessage(input.message);

  return {
    affectedDayNumbers: affectedDayNumbers.length ? affectedDayNumbers : undefined,
    affectedScopeSummary,
  };
}

export function enrichTravelScopeBffFields<T extends FeasibilityIssueDto>(issue: T): T {
  const fields = buildTravelScopeBffFields({
    issueKind: issue.issueKind,
    affectedDays: issue.affectedDays,
    message: issue.message,
    anchors: issue.anchors,
  });
  if (!fields) return issue;
  return { ...issue, ...fields };
}

export function buildTravelScopeBffFieldsFromConflict(
  conflict: ConflictDto,
  affectedDays?: number[],
): TravelScopeBffFields | undefined {
  const issueKind =
    conflict.issueKind ??
    (conflict.type === ConflictType.BUFFER_INSUFFICIENT ? 'buffer_insufficient' : undefined);

  return buildTravelScopeBffFields({
    issueKind,
    affectedDays,
    message: conflict.description,
    fromPlaceLabel: conflict.fromPlaceLabel,
    toPlaceLabel: conflict.toPlaceLabel,
    fromDayNumber: conflict.fromDayNumber,
    toDayNumber: conflict.toDayNumber,
  });
}
