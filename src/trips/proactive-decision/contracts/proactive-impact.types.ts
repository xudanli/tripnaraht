/**
 * RFC-PD-001 — Unified Proactive Impact DTO (nara.proactive_impact@v1).
 *
 * JSON wire form (RFC appendix A) uses snake_case; TypeScript uses camelCase.
 * Use {@link toProactiveImpactWireJson} for API / audit export.
 */

import type { ProactiveDecisionCaseId } from './proactive-decision-case.types';

export const PROACTIVE_IMPACT_SCHEMA_ID = 'nara.proactive_impact@v1' as const;

export type ProactiveImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** V1 allowlisted world signals (Weather + Road only). */
export type ProactiveWorldSignalKind =
  | 'WEATHER_WIND'
  | 'WEATHER_BLIZZARD'
  | 'WEATHER_HEAVY_RAIN'
  | 'ROAD_CLOSURE'
  | 'ROAD_DIFFICULTY_CHANGE'
  | 'ROUTE_AVAILABILITY_CHANGE';

export type ProactiveWorldSignalDomain = 'WEATHER' | 'ROAD';

export function domainOfProactiveSignal(
  kind: ProactiveWorldSignalKind,
): ProactiveWorldSignalDomain {
  return kind.startsWith('WEATHER_') ? 'WEATHER' : 'ROAD';
}

export type ProactiveImpactV1 = {
  schemaId: typeof PROACTIVE_IMPACT_SCHEMA_ID;
  version: 1;
  tripId: string;
  signalKind: ProactiveWorldSignalKind;
  /** Stable id of the upstream WorldSignal / evidence event */
  signalEventId: string;
  impactLevel: ProactiveImpactLevel;
  /** Plan / itinerary item ids affected (RFC: affected_items) */
  affectedItems: string[];
  decisionRequired: boolean;
  /**
   * Set when decisionRequired=true and Case Mapper succeeds.
   * Null when no decision or unmapped (must not open Decision Problem).
   */
  caseId: ProactiveDecisionCaseId | null;
  /** Optional human labels for Surface L2 (e.g. "Day4 Reynisfjara") */
  affectedItemLabels?: string[];
  countryCode: 'IS';
  createdAt: string;
  rationaleZh?: string;
};

/** RFC appendix A wire shape */
export type ProactiveImpactWireJsonV1 = {
  impact_level: ProactiveImpactLevel;
  affected_items: string[];
  decision_required: boolean;
  case_id: ProactiveDecisionCaseId | null;
  trip_id: string;
  signal_kind: ProactiveWorldSignalKind;
  signal_event_id: string;
  schema_id: typeof PROACTIVE_IMPACT_SCHEMA_ID;
};

export function toProactiveImpactWireJson(
  impact: ProactiveImpactV1,
): ProactiveImpactWireJsonV1 {
  return {
    impact_level: impact.impactLevel,
    affected_items: [...impact.affectedItems],
    decision_required: impact.decisionRequired,
    case_id: impact.caseId,
    trip_id: impact.tripId,
    signal_kind: impact.signalKind,
    signal_event_id: impact.signalEventId,
    schema_id: impact.schemaId,
  };
}

export function assertProactiveImpactInvariants(impact: ProactiveImpactV1): void {
  if (impact.schemaId !== PROACTIVE_IMPACT_SCHEMA_ID) {
    throw new Error('[ProactiveImpact] schemaId_mismatch');
  }
  if (impact.version !== 1) {
    throw new Error('[ProactiveImpact] version_mismatch');
  }
  if (impact.countryCode !== 'IS') {
    throw new Error('[ProactiveImpact] countryCode_must_be_IS');
  }
  if (impact.decisionRequired && !impact.caseId) {
    throw new Error('[ProactiveImpact] decision_required_without_case_id');
  }
  if (!impact.decisionRequired && impact.caseId) {
    throw new Error('[ProactiveImpact] case_id_without_decision_required');
  }
  if (impact.decisionRequired && impact.affectedItems.length === 0) {
    throw new Error('[ProactiveImpact] decision_required_without_affected_items');
  }
}
