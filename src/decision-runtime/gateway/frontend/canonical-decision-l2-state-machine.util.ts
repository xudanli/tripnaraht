/**
 * Canonical Runtime L2 flow helpers (RFC-001 / RFC-002 Gateway).
 * Use alongside legacy V1.5 classifyCreateDecisionOutcome — do not mix execution paths.
 */

import type { DecisionRouteResult } from '../contracts/decision-gateway.types';

export type CanonicalL2Phase =
  | 'NEEDS_EVALUATE'
  | 'AWAITING_AUTHORIZE'
  | 'AWAITING_CONFIRMATION'
  | 'AWAITING_EXECUTE'
  | 'EFFECTIVE'
  | 'BLOCKED'
  | 'EXPIRED'
  | 'ROLLED_BACK'
  | 'NEEDS_REPAIR';

export interface CanonicalL2ProblemSignals {
  /** From canonical.problems[].rfc001Problem.semanticCapability */
  semanticCapability?: string;
  /** From canonical.problems[].record?.recordStatus */
  recordStatus?: string;
  /** From canonical.problems[].planVersion?.status */
  planVersionStatus?: string;
  /** From canonical.problems[].requiresUserConfirmation */
  requiresUserConfirmation?: boolean;
  /** L3 payment / irreversible action — needs explicit confirmation beyond L2 authorize */
  requiresL3Confirmation?: boolean;
  /** Gateway route for this problem */
  route?: Pick<DecisionRouteResult, 'resolution' | 'engineId'>;
}

export function isCanonicalL2Problem(signals: CanonicalL2ProblemSignals): boolean {
  if (signals.route?.resolution === 'PRIMARY') return true;
  return Boolean(signals.semanticCapability);
}

export function classifyCanonicalL2Phase(
  signals: CanonicalL2ProblemSignals,
): CanonicalL2Phase {
  const status = signals.recordStatus;
  const pv = signals.planVersionStatus;

  if (status === 'EFFECTIVE') return 'EFFECTIVE';
  if (status === 'ROLLED_BACK') return 'ROLLED_BACK';
  if (status === 'NEEDS_REPAIR') return 'NEEDS_REPAIR';
  if (status === 'BLOCKED') return 'BLOCKED';
  if (status === 'EXPIRED') return 'EXPIRED';
  if (status === 'AUTHORIZED' && pv === 'PENDING_AUTHORIZATION') {
    return 'AWAITING_EXECUTE';
  }
  if (
    status === 'PROPOSED' &&
    signals.requiresL3Confirmation &&
    pv === 'PENDING_AUTHORIZATION'
  ) {
    return 'AWAITING_CONFIRMATION';
  }
  if (
    status === 'PROPOSED' ||
    (pv === 'PENDING_AUTHORIZATION' && signals.requiresUserConfirmation)
  ) {
    return 'AWAITING_AUTHORIZE';
  }
  return 'NEEDS_EVALUATE';
}

/** True when itinerary should refresh after execute succeeds */
export function shouldRefreshItineraryAfterCanonicalExecute(
  phase: CanonicalL2Phase,
): boolean {
  return phase === 'EFFECTIVE';
}

/** Map semanticCapability → UX persona label (display only; routing uses gateway route) */
export function personaLabelForSemanticCapability(
  semanticCapability?: string,
): 'Abu' | 'Dr.Dre' | 'Neptune' | 'Decision Core' {
  switch (semanticCapability) {
    case 'WEATHER_ACTIVITY_PROHIBITED':
    case 'ROAD_SEGMENT_UNAVAILABLE':
    case 'ROAD_SEGMENT_RESTRICTED':
      return 'Abu';
    case 'EXCESSIVE_DAILY_LOAD':
      return 'Dr.Dre';
    default:
      return 'Decision Core';
  }
}
