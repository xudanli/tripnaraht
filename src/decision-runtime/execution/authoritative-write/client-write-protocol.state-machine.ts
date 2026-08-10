/**
 * UWC-1e shared state machine — Web and iOS must obey identical transitions.
 */

import type {
  Uwc1eClientAction,
  Uwc1eSessionState,
} from './client-write-protocol.types';

const ALLOWED: Record<Uwc1eSessionState, readonly Uwc1eClientAction[]> = {
  IDLE: ['PREVIEW'],
  DRAFT: ['CONFIRM', 'PREVIEW'],
  CONFIRMED: ['APPLY', 'PREVIEW'],
  APPLYING: [],
  APPLIED: ['PREVIEW'],
  CONFLICT: ['ACK_CONFLICT_REPREVIEW', 'PREVIEW'],
  VERIFICATION_REQUIRED: ['PREVIEW'],
  REJECTED: ['PREVIEW'],
  IDEMPOTENT_REPLAY: ['PREVIEW'],
};

const NEXT: Partial<
  Record<Uwc1eSessionState, Partial<Record<Uwc1eClientAction, Uwc1eSessionState>>>
> = {
  IDLE: { PREVIEW: 'DRAFT' },
  DRAFT: { CONFIRM: 'CONFIRMED', PREVIEW: 'DRAFT' },
  CONFIRMED: { APPLY: 'APPLYING', PREVIEW: 'DRAFT' },
  CONFLICT: {
    ACK_CONFLICT_REPREVIEW: 'IDLE',
    PREVIEW: 'DRAFT',
  },
  VERIFICATION_REQUIRED: { PREVIEW: 'DRAFT' },
  REJECTED: { PREVIEW: 'DRAFT' },
  APPLIED: { PREVIEW: 'DRAFT' },
  IDEMPOTENT_REPLAY: { PREVIEW: 'DRAFT' },
};

export function isUwc1eTransitionAllowed(
  state: Uwc1eSessionState,
  action: Uwc1eClientAction,
): boolean {
  return (ALLOWED[state] ?? []).includes(action);
}

export function nextUwc1eSessionState(
  state: Uwc1eSessionState,
  action: Uwc1eClientAction,
): Uwc1eSessionState | null {
  if (!isUwc1eTransitionAllowed(state, action)) return null;
  return NEXT[state]?.[action] ?? null;
}

/** Terminal Apply outcomes that forbid silent retry / bypass. */
export function isUwc1eBypassForbiddenOutcome(
  state: Uwc1eSessionState,
): boolean {
  return (
    state === 'VERIFICATION_REQUIRED' ||
    state === 'REJECTED' ||
    state === 'CONFLICT'
  );
}

export function sessionStateFromApplyOutcome(
  outcome: Exclude<
    Uwc1eSessionState,
    'IDLE' | 'DRAFT' | 'CONFIRMED' | 'APPLYING'
  >,
): Uwc1eSessionState {
  return outcome;
}

export const UWC_1E_STATE_MACHINE_RULES = {
  conflictRequiresRePreview: true as const,
  verificationRequiredNoBypass: true as const,
  rejectedNoBypass: true as const,
  previewNeverEntersApplyPipeline: true as const,
  confirmNeverEntersApplyPipeline: true as const,
  applyOnlyEntersPipeline: true as const,
} as const;
