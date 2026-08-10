/**
 * 长期行为观察点 — Useful / Unnecessary / Dismiss / Snooze / Repeated Ignore / Intervention Regret。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';

export const PROACTIVE_BEHAVIOR_OBSERVATION_SCHEMA =
  'nara.proactive_behavior_observation@v1' as const;

export type ProactiveBehaviorKind =
  | 'USEFUL'
  | 'UNNECESSARY'
  | 'DISMISS'
  | 'SNOOZE'
  | 'REPEATED_IGNORE'
  | 'INTERVENTION_REGRET'
  | 'SUPPRESSED_CORRECT'
  | 'SUPPRESSED_MISSED';

export type ProactiveBehaviorObservationV1 = {
  schemaId: typeof PROACTIVE_BEHAVIOR_OBSERVATION_SCHEMA;
  version: 1;
  observationId: string;
  tripId: string;
  dayKey: string;
  scenarioId: TemporalScenarioId;
  deliveryLevel: 'L1_PASSIVE' | 'L2_IN_APP_INTERRUPT' | 'NONE';
  kind: ProactiveBehaviorKind;
  surfaced: boolean;
  observedAt: string;
  noteZh?: string;
};

export function recordProactiveBehaviorObservation(input: {
  tripId: string;
  dayKey: string;
  scenarioId: TemporalScenarioId;
  deliveryLevel: ProactiveBehaviorObservationV1['deliveryLevel'];
  kind: ProactiveBehaviorKind;
  surfaced: boolean;
  observedAt?: string;
  observationId?: string;
  noteZh?: string;
}): ProactiveBehaviorObservationV1 {
  return {
    schemaId: PROACTIVE_BEHAVIOR_OBSERVATION_SCHEMA,
    version: 1,
    observationId:
      input.observationId ??
      `pbo_${input.tripId}_${input.dayKey}_${Date.now()}`,
    tripId: input.tripId,
    dayKey: input.dayKey,
    scenarioId: input.scenarioId,
    deliveryLevel: input.deliveryLevel,
    kind: input.kind,
    surfaced: input.surfaced,
    observedAt: input.observedAt ?? new Date().toISOString(),
    noteZh: input.noteZh,
  };
}
