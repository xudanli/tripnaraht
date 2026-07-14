import type { DailyDrivePlan } from '../../tep/contracts/tep-self-drive.types';
import type { ConstraintImpactAffectedDayDetail } from '../types/trip-constraint.types';
import type { FeasibilityIssueAnchorsDto } from '../types/trip-constraint-solver.types';
import { formatClockLabelOptional } from '../../../common/utils/format-clock-label.util';
import { formatDriveDurationZh, formatDriveDurationZhLong } from './daily-drive-threshold.util';

export interface DailyDriveLegAnchor {
  fromItemId?: string;
  toItemId?: string;
  fromPlaceLabel?: string;
  toPlaceLabel?: string;
  travelMinutes?: number;
  departAt?: string;
}

function formatClockLabel(value?: string): string | undefined {
  return formatClockLabelOptional(value);
}

function hasRouteLabel(leg: DailyDriveLegAnchor): boolean {
  return Boolean(leg.fromPlaceLabel?.trim() || leg.toPlaceLabel?.trim());
}

export function driveLegsFromIssueAnchors(
  anchors?: FeasibilityIssueAnchorsDto,
): DailyDriveLegAnchor[] {
  if (anchors?.driveLegs?.length) {
    return anchors.driveLegs.filter(hasRouteLabel);
  }
  if (hasRouteLabel(anchors ?? {})) {
    return [
      {
        fromItemId: anchors?.fromItemId,
        toItemId: anchors?.toItemId,
        fromPlaceLabel: anchors?.fromPlaceLabel,
        toPlaceLabel: anchors?.toPlaceLabel,
        travelMinutes: anchors?.travelTimeMinutes ?? anchors?.travelMinutes,
        departAt: anchors?.departAt ?? anchors?.fromTime,
      },
    ];
  }
  return [];
}

export function driveLegsFromTepPlan(
  plan: DailyDrivePlan,
  itemLabelsById: Map<string, string>,
): DailyDriveLegAnchor[] {
  if (plan.legs.length) {
    return plan.legs
      .map((leg) => ({
        fromItemId: leg.fromRef,
        toItemId: leg.toRef,
        fromPlaceLabel: itemLabelsById.get(leg.fromRef) ?? plan.origin.label,
        toPlaceLabel: itemLabelsById.get(leg.toRef) ?? plan.destination.label,
        travelMinutes: leg.adjustedMinutes ?? leg.baseNavigationMinutes,
      }))
      .filter(hasRouteLabel);
  }

  if (
    plan.origin.label &&
    plan.destination.label &&
    plan.origin.label !== plan.destination.label
  ) {
    return [
      {
        fromPlaceLabel: plan.origin.label,
        toPlaceLabel: plan.destination.label,
      },
    ];
  }

  return [];
}

export function buildDriveScheduleItems(input: {
  legs: DailyDriveLegAnchor[];
  dayDriveMinutes?: number;
  limitHours?: number;
}): NonNullable<ConstraintImpactAffectedDayDetail['items']> {
  const actualLabel =
    input.dayDriveMinutes != null
      ? formatDriveDurationZhLong(input.dayDriveMinutes)
      : undefined;

  return input.legs.map((leg) => {
    const from = leg.fromPlaceLabel?.trim();
    const to = leg.toPlaceLabel?.trim();
    const segmentMinutes = leg.travelMinutes;
    return {
      itemId: leg.toItemId,
      label: from && to ? `${from} → ${to}` : from ?? to ?? '驾驶路段',
      startTimeLabel: formatClockLabel(leg.departAt),
      detail:
        input.dayDriveMinutes != null && input.limitHours != null
          ? `本段驾驶约 ${formatDriveDurationZh(segmentMinutes ?? input.dayDriveMinutes)}，当日累计 ${actualLabel ?? formatDriveDurationZhLong(input.dayDriveMinutes)}`
          : segmentMinutes != null
            ? `本段驾驶约 ${formatDriveDurationZh(segmentMinutes)}`
            : undefined,
      impactType: 'DRIVE_OVER_LIMIT' as const,
    };
  });
}

export function buildItemLabelMapFromItineraryRows(
  rows: Array<{ id: string; placeNameCN?: string | null; placeNameEN?: string | null; note?: string | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const name = `${row.placeNameCN ?? ''} ${row.placeNameEN ?? ''}`.trim();
    if (name) {
      map.set(row.id, name);
      continue;
    }
    const note = row.note?.trim();
    if (note && !note.startsWith('{')) {
      map.set(row.id, note);
    }
  }
  return map;
}
