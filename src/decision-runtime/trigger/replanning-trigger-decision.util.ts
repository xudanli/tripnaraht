/**
 * M3 — Map ReplanningTriggerResult → formal decision output (ROADMAP §8.2 M3).
 */

import type { ReplanningAction, ReplanningTriggerResult } from './replanning-trigger.policy';

export const REPLANNING_TRIGGER_DECISION_SCHEMA_ID =
  'tripnara.replanning_trigger_decision@v1';

export type ReplanningScope = 'ITEM' | 'DAY' | 'SEGMENT' | 'FULL_TRIP';
export type ReplanningStrategy = 'ADVISORY' | 'LOCAL_REPAIR' | 'FULL_REPLAN';
export type ReplanningUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ReplanningTriggerDecision {
  schemaId: typeof REPLANNING_TRIGGER_DECISION_SCHEMA_ID;
  shouldTrigger: boolean;
  scope: ReplanningScope;
  strategy: ReplanningStrategy;
  urgency: ReplanningUrgency;
  humanConfirmationRequired: boolean;
  action: ReplanningAction;
  policyEnabled: boolean;
  rationale: string;
}

export function toReplanningTriggerDecision(
  result: ReplanningTriggerResult,
  hints?: { eventSeverity?: 'LOW' | 'MEDIUM' | 'HIGH' },
): ReplanningTriggerDecision {
  const action = result.action;
  const shouldTrigger = action !== 'NO_OP' && action !== 'USER_CONFIRMATION_REQUIRED';

  return {
    schemaId: REPLANNING_TRIGGER_DECISION_SCHEMA_ID,
    shouldTrigger,
    scope: scopeForAction(action),
    strategy: strategyForAction(action),
    urgency: urgencyForAction(action, hints?.eventSeverity),
    humanConfirmationRequired:
      action === 'USER_CONFIRMATION_REQUIRED' ||
      action === 'PARTIAL_REPLAN',
    action,
    policyEnabled: result.policyEnabled,
    rationale: result.rationale,
  };
}

function scopeForAction(action: ReplanningAction): ReplanningScope {
  switch (action) {
    case 'LOCAL_REPAIR':
      return 'ITEM';
    case 'PARTIAL_REPLAN':
      return 'DAY';
    case 'FULL_REPLAN':
      return 'FULL_TRIP';
    default:
      return 'SEGMENT';
  }
}

function strategyForAction(action: ReplanningAction): ReplanningStrategy {
  switch (action) {
    case 'LOCAL_REPAIR':
    case 'PARTIAL_REPLAN':
      return 'LOCAL_REPAIR';
    case 'FULL_REPLAN':
      return 'FULL_REPLAN';
    case 'NO_OP':
      return 'ADVISORY';
    default:
      return 'ADVISORY';
  }
}

function urgencyForAction(
  action: ReplanningAction,
  eventSeverity?: 'LOW' | 'MEDIUM' | 'HIGH',
): ReplanningUrgency {
  if (action === 'FULL_REPLAN') return 'HIGH';
  if (action === 'NO_OP') return 'LOW';
  if (eventSeverity === 'HIGH') return 'HIGH';
  if (eventSeverity === 'MEDIUM') return 'MEDIUM';
  return action === 'USER_CONFIRMATION_REQUIRED' ? 'MEDIUM' : 'LOW';
}

/** Infer WORLD_EVENT severity from kernel replan reason strings */
export function inferWorldEventSeverity(reason: string): 'LOW' | 'MEDIUM' | 'HIGH' {
  const r = reason.toLowerCase();
  if (
    r.includes('cancelled') ||
    r.includes('closed') ||
    r.includes('storm') ||
    r.includes('emergency')
  ) {
    return 'HIGH';
  }
  if (r.includes('delay') || r.includes('weather') || r.includes('deviation')) {
    return 'MEDIUM';
  }
  return 'LOW';
}

/** Kernel full replan should run only for these actions when policy is enabled */
export function shouldRunKernelFullReplan(action: ReplanningAction): boolean {
  return action === 'FULL_REPLAN' || action === 'PARTIAL_REPLAN';
}
