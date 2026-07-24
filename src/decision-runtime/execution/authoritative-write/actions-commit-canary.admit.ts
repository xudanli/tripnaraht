/**
 * First-round ACTIONS_COMMIT canary admission.
 * Only NO_EFFECTIVE_SIDE_EFFECT actions: no external SE, no PlanVersion/Trip/ItineraryItem writes.
 */

import { getActionsCommitCanaryAllowlist } from './actions-commit-canary.config';

export const CANARY_FORBIDDEN_WRITE_HINTS = [
  'plan_version',
  'planversion',
  'trip.apply',
  'itinerary',
  'financial_hold',
  'resource_lock',
  'inventory_lock',
  'booking',
  'payment',
  'refund',
] as const;

export type ActionsCommitCanaryAdmissionInput = {
  actionNames: readonly string[];
  actionTypes?: readonly string[];
  sideEffectHandlerIds?: readonly string[];
  /** Explicit opt-in marker from client/meta (optional) */
  declaredNoEffectiveSideEffect?: boolean;
};

export type ActionsCommitCanaryAdmissionResult = {
  admitted: boolean;
  reasonCodes: string[];
};

export function admitActionsCommitCanaryRequest(
  input: ActionsCommitCanaryAdmissionInput,
  env: NodeJS.ProcessEnv = process.env,
): ActionsCommitCanaryAdmissionResult {
  const reasonCodes: string[] = [];
  const allowlist = new Set(
    getActionsCommitCanaryAllowlist(env).map((s) => s.toLowerCase()),
  );

  if (!input.actionNames.length) {
    return { admitted: false, reasonCodes: ['NO_ACTIONS'] };
  }

  for (const name of input.actionNames) {
    const n = String(name ?? '').trim().toLowerCase();
    if (!allowlist.has(n)) {
      reasonCodes.push(`ACTION_NOT_IN_ALLOWLIST:${name}`);
    }
    for (const hint of CANARY_FORBIDDEN_WRITE_HINTS) {
      if (n.includes(hint)) {
        reasonCodes.push(`FORBIDDEN_WRITE_HINT:${hint}`);
      }
    }
  }

  for (const t of input.actionTypes ?? []) {
    const upper = String(t).toUpperCase();
    if (
      upper.startsWith('BOOK') ||
      upper.startsWith('PAY') ||
      upper.startsWith('CANCEL') ||
      upper.startsWith('ADJUST')
    ) {
      reasonCodes.push(`FORBIDDEN_ACTION_TYPE:${t}`);
    }
  }

  for (const h of input.sideEffectHandlerIds ?? []) {
    const id = String(h).toLowerCase();
    if (
      id.includes('financial') ||
      id.includes('lock') ||
      id.includes('inventory') ||
      id.includes('hold')
    ) {
      reasonCodes.push(`EXTERNAL_OR_LOCK_SIDE_EFFECT:${h}`);
    }
  }

  if (input.sideEffectHandlerIds && input.sideEffectHandlerIds.length > 0) {
    reasonCodes.push('HAS_SIDE_EFFECT_HANDLERS');
  }

  // Must not claim PlanVersion / Trip / ItineraryItem writes
  reasonCodes.push('ADMISSION_SCOPE_NO_EFFECTIVE_SIDE_EFFECT');

  const blocking = reasonCodes.filter(
    (c) =>
      c.startsWith('ACTION_NOT_IN_ALLOWLIST') ||
      c.startsWith('FORBIDDEN_') ||
      c.startsWith('EXTERNAL_') ||
      c === 'HAS_SIDE_EFFECT_HANDLERS' ||
      c === 'NO_ACTIONS',
  );

  if (blocking.length) {
    return { admitted: false, reasonCodes: [...blocking, ...reasonCodes] };
  }

  return {
    admitted: true,
    reasonCodes: [
      'NO_EFFECTIVE_SIDE_EFFECT',
      'NO_EXTERNAL_SIDE_EFFECT',
      'NO_PLANVERSION_TRIP_ITINERARY_WRITE',
      'ADMISSION_SCOPE_NO_EFFECTIVE_SIDE_EFFECT',
    ],
  };
}
