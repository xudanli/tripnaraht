/**
 * PD-0.4 — Orchestrator boundary (types only; no Nest runtime yet).
 *
 * Thin wiring layer: WorldSignal → Impact → Case → (later) Decision Problem.
 * Not a new Agent. Idempotency: tripId + signalEventId + caseId.
 */

import type { ProactiveImpactV1 } from '../contracts/proactive-impact.types';
import type { ProactiveWorldSignalKind } from '../contracts/proactive-impact.types';

export const PROACTIVE_ORCHESTRATOR_SCHEMA_ID =
  'nara.proactive_decision_orchestrator@v1' as const;

export type ProactiveWorldSignalV1 = {
  schemaId: 'nara.proactive_world_signal@v1';
  version: 1;
  tripId: string;
  signalEventId: string;
  signalKind: ProactiveWorldSignalKind;
  countryCode: 'IS';
  observedAt: string;
  /** Opaque payload reference into Guardian world-state / evidence */
  evidenceRef?: string;
};

export type ProactiveOrchestratorShortCircuit =
  | 'SIGNAL_NOT_ALLOWLISTED'
  | 'NO_AFFECTED_ITEMS'
  | 'IMPACT_BELOW_THRESHOLD'
  | 'CASE_UNMAPPED'
  | 'FEATURE_FLAG_OFF';

export type ProactiveOrchestratorStepResult =
  | {
      status: 'CONTINUE';
      impact: ProactiveImpactV1;
      idempotencyKey: string;
    }
  | {
      status: 'SILENT';
      reason: ProactiveOrchestratorShortCircuit;
      impact?: ProactiveImpactV1;
      idempotencyKey: string;
    };

export function buildProactiveIdempotencyKey(input: {
  tripId: string;
  signalEventId: string;
  caseId: string | null;
}): string {
  return `pd_v1:${input.tripId}:${input.signalEventId}:${input.caseId ?? 'none'}`;
}

/**
 * After Impact+Case: open Decision Problem only when decisionRequired.
 */
export function shouldOpenDecisionProblem(impact: ProactiveImpactV1): boolean {
  return impact.decisionRequired === true && impact.caseId != null;
}
