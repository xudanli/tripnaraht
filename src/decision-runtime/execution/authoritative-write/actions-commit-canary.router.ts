/**
 * Deterministic ACTIONS_COMMIT canary routing — no dual execution.
 */

import {
  resolveActionsCommitCanaryGate,
  UWC_ACTIONS_CANARY_MODE,
} from './actions-commit-canary.config';
import {
  admitActionsCommitCanaryRequest,
  type ActionsCommitCanaryAdmissionInput,
} from './actions-commit-canary.admit';

export type ActionsCommitCanaryRouteDecision = {
  mode: typeof UWC_ACTIONS_CANARY_MODE | 'LEGACY_WITH_SHADOW';
  /** true → execute UWC only; false → Legacy + Shadow */
  selectedForCanary: boolean;
  reasonCodes: string[];
  bucket: number;
  percent: number;
};

/** Stable 0–99 bucket from key. */
export function canaryBucket(key: string): number {
  let h = 0;
  const s = String(key ?? '');
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % 100;
}

export function decideActionsCommitCanaryRoute(input: {
  routingKey: string;
  admission: ActionsCommitCanaryAdmissionInput;
  env?: NodeJS.ProcessEnv;
}): ActionsCommitCanaryRouteDecision {
  const env = input.env ?? process.env;
  const gate = resolveActionsCommitCanaryGate(env);
  const admission = admitActionsCommitCanaryRequest(input.admission, env);
  const bucket = canaryBucket(input.routingKey);

  if (!gate.enabled) {
    return {
      mode: 'LEGACY_WITH_SHADOW',
      selectedForCanary: false,
      reasonCodes: [
        gate.killSwitch ? 'KILL_SWITCH' : 'CANARY_NOT_AUTHORIZED_OR_DISABLED',
        ...admission.reasonCodes,
      ],
      bucket,
      percent: gate.percent,
    };
  }

  if (!admission.admitted) {
    return {
      mode: 'LEGACY_WITH_SHADOW',
      selectedForCanary: false,
      reasonCodes: ['NOT_ADMITTED', ...admission.reasonCodes],
      bucket,
      percent: gate.percent,
    };
  }

  if (bucket >= gate.percent) {
    return {
      mode: 'LEGACY_WITH_SHADOW',
      selectedForCanary: false,
      reasonCodes: ['PERCENT_MISS', `bucket=${bucket}`, `percent=${gate.percent}`],
      bucket,
      percent: gate.percent,
    };
  }

  return {
    mode: UWC_ACTIONS_CANARY_MODE,
    selectedForCanary: true,
    reasonCodes: [
      'SELECTED_AUTHORITATIVE_CANARY',
      `bucket=${bucket}`,
      `percent=${gate.percent}`,
      ...admission.reasonCodes,
    ],
    bucket,
    percent: gate.percent,
  };
}

/**
 * Legacy fallback policy after a canary attempt.
 * Only technical exceptions before any side effect may fallback.
 */
export type CanaryFallbackDecision =
  | { allowLegacyFallback: true; reason: 'TECHNICAL_PRE_SIDE_EFFECT' }
  | { allowLegacyFallback: false; reason: string };

export function decideCanaryLegacyFallback(input: {
  /** UWC business outcome when available */
  uwcOutcome?:
    | 'APPLIED'
    | 'CONFLICT'
    | 'VERIFICATION_REQUIRED'
    | 'REJECTED'
    | 'IDEMPOTENT_REPLAY';
  uwcErrorCode?: string;
  technicalExceptionBeforeSideEffects?: boolean;
  sideEffectsStarted?: boolean;
}): CanaryFallbackDecision {
  if (input.sideEffectsStarted) {
    return { allowLegacyFallback: false, reason: 'SIDE_EFFECTS_ALREADY_STARTED' };
  }

  if (input.uwcOutcome === 'CONFLICT') {
    return { allowLegacyFallback: false, reason: 'UWC_CONFLICT_NO_FALLBACK' };
  }
  if (input.uwcOutcome === 'REJECTED') {
    return { allowLegacyFallback: false, reason: 'UWC_REJECTED_NO_FALLBACK' };
  }
  if (input.uwcOutcome === 'VERIFICATION_REQUIRED') {
    return { allowLegacyFallback: false, reason: 'UWC_VERIFICATION_REQUIRED_NO_FALLBACK' };
  }
  if (
    input.uwcErrorCode === 'AUTHORITY_DENIED' ||
    input.uwcErrorCode === 'VERIFICATION_REQUIRED' ||
    input.uwcErrorCode === 'VERIFICATION_FAILED'
  ) {
    return { allowLegacyFallback: false, reason: 'UWC_AUTH_OR_VERIFY_NO_FALLBACK' };
  }

  if (input.technicalExceptionBeforeSideEffects) {
    return { allowLegacyFallback: true, reason: 'TECHNICAL_PRE_SIDE_EFFECT' };
  }

  return { allowLegacyFallback: false, reason: 'NO_FALLBACK_DEFAULT' };
}
