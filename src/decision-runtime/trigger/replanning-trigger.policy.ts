/**
 * Replanning Trigger Policy — world change ≠ automatic full replan.
 * @see DECISION_RUNTIME_MATURITY.md §8 P5
 */

import type { DecisionTriggerKind } from '../contracts/decision-run-request';
import { isReplanningTriggerPolicyEnabled } from './replanning-trigger.config';

export const REPLANNING_TRIGGER_RESULT_SCHEMA_ID =
  'tripnara.replanning_trigger_result@v1';

export type ReplanningAction =
  | 'NO_OP'
  | 'LOCAL_REPAIR'
  | 'PARTIAL_REPLAN'
  | 'FULL_REPLAN'
  | 'USER_CONFIRMATION_REQUIRED';

export interface ReplanningTriggerInput {
  tripId: string;
  triggerKind: DecisionTriggerKind;
  problemId?: string;
  eventSeverity?: 'LOW' | 'MEDIUM' | 'HIGH';
  affectsEffectivePlan?: boolean;
  decisionRecordStale?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ReplanningTriggerResult {
  schemaId: typeof REPLANNING_TRIGGER_RESULT_SCHEMA_ID;
  tripId: string;
  triggerKind: DecisionTriggerKind;
  action: ReplanningAction;
  rationale: string;
  evaluatedAt: string;
  policyEnabled: boolean;
}

export function evaluateReplanningTrigger(
  input: ReplanningTriggerInput,
): ReplanningTriggerResult {
  const policyEnabled = isReplanningTriggerPolicyEnabled();
  const action = policyEnabled
    ? classifyReplanningAction(input)
    : 'USER_CONFIRMATION_REQUIRED';

  return {
    schemaId: REPLANNING_TRIGGER_RESULT_SCHEMA_ID,
    tripId: input.tripId,
    triggerKind: input.triggerKind,
    action,
    rationale: buildRationale(input, action),
    evaluatedAt: new Date().toISOString(),
    policyEnabled,
  };
}

function classifyReplanningAction(input: ReplanningTriggerInput): ReplanningAction {
  if (
    input.triggerKind === 'CANONICAL_MONITORING_POLL' &&
    !input.decisionRecordStale
  ) {
    return 'NO_OP';
  }

  if (input.triggerKind === 'LEGACY_AGENT_ROUTE') {
    return 'USER_CONFIRMATION_REQUIRED';
  }

  if (input.triggerKind === 'IN_TRIP_DEVIATION') {
    return input.eventSeverity === 'HIGH' ? 'PARTIAL_REPLAN' : 'LOCAL_REPAIR';
  }

  if (input.triggerKind === 'WORLD_EVENT') {
    if (input.eventSeverity === 'HIGH' && input.affectsEffectivePlan) {
      return input.decisionRecordStale ? 'FULL_REPLAN' : 'LOCAL_REPAIR';
    }
    if (input.eventSeverity === 'MEDIUM') {
      return 'LOCAL_REPAIR';
    }
    return 'NO_OP';
  }

  if (
    input.triggerKind === 'USER_INTENT' ||
    input.triggerKind === 'MANUAL_REPAIR_REQUEST' ||
    input.triggerKind === 'GUIDE_IMPORT_REQUEST'
  ) {
    return input.triggerKind === 'GUIDE_IMPORT_REQUEST'
      ? 'PARTIAL_REPLAN'
      : 'USER_CONFIRMATION_REQUIRED';
  }

  if (
    input.triggerKind === 'FULL_PLAN_SELECTION' ||
    input.triggerKind === 'CANONICAL_PROBLEM_EVALUATE'
  ) {
    return 'PARTIAL_REPLAN';
  }

  return 'USER_CONFIRMATION_REQUIRED';
}

function buildRationale(
  input: ReplanningTriggerInput,
  action: ReplanningAction,
): string {
  return `trigger=${input.triggerKind} severity=${input.eventSeverity ?? 'n/a'} stale=${input.decisionRecordStale ?? false} → ${action}`;
}
