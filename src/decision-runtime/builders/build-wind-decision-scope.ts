/**
 * Strong-wind DecisionScope builder (Authority Consistency P3/P4).
 */

import type { TravelWorldStateSnapshot } from '../contracts/world-state-snapshot';
import {
  DECISION_SCOPE_SCHEMA,
  type DecisionScope,
} from '../contracts/decision-scope.types';

export function buildWindDecisionScope(input: {
  snapshot: TravelWorldStateSnapshot;
  trigger?: string;
  activityId?: string;
  segmentId?: string;
  lockedBookingIds?: string[];
  decisionWindow?: { from: string; to: string };
}): DecisionScope {
  const snap = input.snapshot;
  const inferred = snap.inferred;
  const activityId = input.activityId ?? 'activity:checkin';
  const segmentId = input.segmentId ?? snap.roads[0]?.segmentId ?? 'segment:current';
  const from =
    input.decisionWindow?.from ??
    snap.createdAt;
  const to =
    input.decisionWindow?.to ??
    inferred?.interventionDeadline ??
    new Date(Date.parse(snap.createdAt) + 8 * 3600000).toISOString();

  const locked = (input.lockedBookingIds ?? []).map((id) => ({
    kind: 'BOOKING',
    id,
  }));

  return {
    schema: DECISION_SCOPE_SCHEMA,
    snapshotId: snap.snapshotId,
    tripId: snap.tripId,
    trigger: input.trigger ?? 'WEATHER_DETERIORATION_STRONG_WIND',
    affectedObjects: [
      { kind: 'SEGMENT', id: segmentId },
      { kind: 'ACTIVITY', id: activityId },
      ...(snap.vehicle?.vehicleClass
        ? [{ kind: 'VEHICLE', id: `vehicle:${snap.vehicle.vehicleClass}` }]
        : []),
    ],
    affectedDays: [0],
    decisionWindow: { from, to },
    mutableObjects: [
      { kind: 'ACTIVITY', id: activityId },
      { kind: 'SEGMENT', id: segmentId },
      { kind: 'STOP', id: 'stop:mid_waterfall' },
    ],
    lockedObjects: locked,
    allowedActions: [
      'DROP_STOP',
      'SHIFT_DEPARTURE',
      'AVOID_EXPOSED_SEGMENT',
      'DOWNGRADE_VEHICLE',
      'CANCEL_ACTIVITY',
    ],
    forbiddenActions: [
      'MOVE_DAY',
      'REPLACE_LOCKED_BOOKING',
      'BYPASS_CONFIRM',
      'DIRECT_SET_EFFECTIVE',
    ],
    hardConstraints: [
      'ROAD_STATUS_BLOCKED',
      'VEHICLE_CAPABILITY_MISMATCH',
      'BOOKING_LOCKED',
    ],
    softObjectives: [
      'MINIMIZE_MISS_PROBABILITY',
      'MINIMIZE_FATIGUE',
      'PRESERVE_EXPERIENCE',
      'MINIMIZE_COST_LOSS',
    ],
  };
}
