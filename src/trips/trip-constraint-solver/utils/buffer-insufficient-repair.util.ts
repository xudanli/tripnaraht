/**
 * BUFFER_INSUFFICIENT → feasibility report issue + 分钟级 repair（P0-2）
 */

import { ConflictDto, ConflictType } from '../../dto/trip-conflicts.dto';
import type {
  FeasibilityIssueDto,
  FeasibilityProofDto,
  FeasibilityRepairOptionDto,
} from '../types/trip-constraint-solver.types';
import {
  buildMinuteBufferRepairOptions,
  buildShiftDepartureRepairOption,
} from './travel-timing-repair.util';

export function isBufferInsufficientConflict(c: ConflictDto): boolean {
  return (
    c.type === ConflictType.BUFFER_INSUFFICIENT ||
    c.issueKind === 'buffer_insufficient' ||
    c.id.startsWith('buffer-insufficient-')
  );
}

export function buildBufferInsufficientRepairOptions(input: {
  issueId: string;
  toItemId: string;
  toLabel?: string;
  shortfallMinutes?: number;
  suggestedTime?: string;
  anchors?: FeasibilityIssueDto['anchors'];
}): FeasibilityRepairOptionDto[] {
  const shortfall = Math.max(input.shortfallMinutes ?? 15, 1);
  return [
    ...buildMinuteBufferRepairOptions({
      issueId: input.issueId,
      toItemId: input.toItemId,
      fromItemId: input.anchors?.fromItemId,
      toLabel: input.toLabel,
      toDayNumber: input.anchors?.toDayNumber,
      shortfallMinutes: shortfall,
      anchors: input.anchors,
    }),
    buildShiftDepartureRepairOption({
      issueId: input.issueId,
      toItemId: input.toItemId,
      toLabel: input.toLabel,
      shortfallMinutes: shortfall,
      bufferMinutes: 15,
      suggestedTime: input.suggestedTime,
      anchors: input.anchors,
    }),
  ];
}

export function buildBufferInsufficientProofs(
  c: ConflictDto,
  issueId: string,
): FeasibilityProofDto[] {
  const fromItemId = c.fromItemId ?? c.affectedItemIds?.[0];
  const toItemId = c.toItemId ?? c.affectedItemIds?.[1];
  const fromLabel = c.fromPlaceLabel ?? '上一项';
  const toLabel = c.toPlaceLabel ?? '下一项';
  const repairOptions = buildBufferInsufficientRepairOptions({
    issueId,
    toItemId: toItemId!,
    toLabel,
    shortfallMinutes: c.shortfallMinutes,
    suggestedTime: c.suggestedTime,
    anchors: {
      fromItemId,
      toItemId,
      gapMinutes: c.gapMinutes,
      shortfallMinutes: c.shortfallMinutes,
    },
  });

  return [
    {
      itemId: toItemId,
      fromItemId,
      toItemId,
      placeLabel: toLabel,
      entity: `${fromLabel} → ${toLabel}`,
      constraint: 'schedule.activity_buffer',
      currentFact: c.description,
      evidenceSource: 'trip.conflicts',
      evidenceType: 'buffer_insufficient',
      ruleId: 'schedule.buffer.insufficient',
      conclusion:
        (c.shortfallMinutes ?? 0) > 0
          ? `缓冲不足约 ${Math.round(c.shortfallMinutes ?? 0)} 分钟`
          : '活动间缓冲偏紧',
      confidence: 0.85,
      repairOptions,
      planBOptions: repairOptions,
    },
  ];
}

export function bufferConflictAnchors(c: ConflictDto): FeasibilityIssueDto['anchors'] {
  const fromItemId = c.fromItemId ?? c.affectedItemIds?.[0];
  const toItemId = c.toItemId ?? c.affectedItemIds?.[1];
  return {
    fromItemId,
    toItemId,
    fromDayNumber: c.fromDayNumber,
    toDayNumber: c.toDayNumber ?? c.fromDayNumber,
    fromPlaceLabel: c.fromPlaceLabel,
    toPlaceLabel: c.toPlaceLabel,
    gapMinutes: c.gapMinutes,
    shortfallMinutes: c.shortfallMinutes,
    suggestedTime: c.suggestedTime,
    bufferMinutes: 15,
  };
}

export function bufferConflictUiHints(
  c: ConflictDto,
  context?: { tripId?: string },
): FeasibilityIssueDto['uiHints'] {
  const fromItemId = c.fromItemId ?? c.affectedItemIds?.[0];
  const toItemId = c.toItemId ?? c.affectedItemIds?.[1];
  const dayIndex = Math.max(0, (c.fromDayNumber ?? 1) - 1);
  return {
    primaryAction: 'add_buffer',
    deepLink: {
      tab: 'schedule',
      dayIndex,
      highlightItemIds: [fromItemId, toItemId].filter(Boolean) as string[],
    },
    tripPath: `/trips/${context?.tripId ?? ''}?tab=schedule&itemId=${toItemId ?? ''}`,
  };
}
