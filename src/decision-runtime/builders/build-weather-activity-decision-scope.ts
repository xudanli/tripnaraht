/**
 * Weather-activity (outdoor storm) DecisionScope for live RFC-001 L2 path.
 * Aligns with buildWeatherActivityStubCandidates (REPLACE_ITEM indoor).
 */

import {
  DECISION_SCOPE_SCHEMA,
  type DecisionScope,
} from '../contracts/decision-scope.types';

export function buildWeatherActivityDecisionScope(input: {
  snapshotId: string;
  tripId: string;
  affectedPlanItemIds: string[];
  affectedDayIndex?: number;
  decisionWindow?: { from: string; to: string };
  trigger?: string;
}): DecisionScope {
  const now = new Date().toISOString();
  const from = input.decisionWindow?.from ?? now;
  const to =
    input.decisionWindow?.to ??
    new Date(Date.parse(now) + 8 * 3600000).toISOString();
  const mutableObjects = input.affectedPlanItemIds.map((id) => ({
    kind: 'PLAN_ITEM',
    id,
  }));

  return {
    schema: DECISION_SCOPE_SCHEMA,
    snapshotId: input.snapshotId,
    tripId: input.tripId,
    trigger: input.trigger ?? 'WEATHER_ACTIVITY_PROHIBITED',
    affectedObjects: [...mutableObjects],
    affectedDays:
      input.affectedDayIndex !== undefined ? [input.affectedDayIndex] : [0],
    decisionWindow: { from, to },
    mutableObjects,
    lockedObjects: [],
    allowedActions: [
      'REPLACE_ITEM',
      'CANCEL_ACTIVITY',
      'KEEP_ORIGINAL',
      'SHIFT_DEPARTURE',
    ],
    forbiddenActions: [
      'DIRECT_SET_EFFECTIVE',
      'BYPASS_CONFIRM',
      'MOVE_DAY',
      'REPLACE_LOCKED_BOOKING',
    ],
    hardConstraints: [
      'WEATHER_ACTIVITY_PROHIBITED',
      'OUTDOOR_EXPOSURE_UNSAFE',
    ],
    softObjectives: [
      'PRESERVE_EXPERIENCE',
      'MINIMIZE_COST_LOSS',
      'MINIMIZE_FATIGUE',
    ],
  };
}
