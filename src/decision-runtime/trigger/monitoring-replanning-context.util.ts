/**
 * Derive replanning hints for monitoring polls (WORLD_EVENT semantics).
 */

import type { Rfc001DecisionRecord } from '../../trips/guardian-decision-core/contracts/decision-record.types';
import type { CanonicalMonitoringPollKind } from '../contracts/decision-run-request';

export type MonitoringEventSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface MonitoringReplanningSignals {
  eventSeverity: MonitoringEventSeverity;
  affectsEffectivePlan: boolean;
  decisionRecordStale: boolean;
}

export interface MonitoringPollResultHints {
  changed?: boolean;
  overloaded?: boolean;
  hardClosure?: boolean;
}

export function deriveMonitoringReplanningSignals(input: {
  pollKind: CanonicalMonitoringPollKind;
  decisions: Rfc001DecisionRecord[];
  hasEffectivePlanVersion: boolean;
  pollResult?: MonitoringPollResultHints;
}): MonitoringReplanningSignals {
  const decisionRecordStale = input.decisions.some(
    (d) => d.recordStatus === 'PROPOSED' || d.recordStatus === 'NEEDS_REPAIR',
  );
  const affectsEffectivePlan =
    input.hasEffectivePlanVersion ||
    input.decisions.some((d) => d.recordStatus === 'EFFECTIVE');

  let eventSeverity: MonitoringEventSeverity = 'LOW';
  if (input.pollKind === 'WEATHER_HAZARD') {
    if (input.pollResult?.hardClosure) {
      eventSeverity = 'HIGH';
    } else if (input.pollResult?.changed) {
      eventSeverity = 'MEDIUM';
    }
  } else if (input.pollResult?.overloaded) {
    eventSeverity = 'MEDIUM';
  }

  return { eventSeverity, affectsEffectivePlan, decisionRecordStale };
}

export function monitoringSignalsToTriggerMetadata(
  signals: MonitoringReplanningSignals,
): Record<string, unknown> {
  return {
    eventSeverity: signals.eventSeverity,
    affectsEffectivePlan: signals.affectsEffectivePlan,
    decisionRecordStale: signals.decisionRecordStale,
  };
}
