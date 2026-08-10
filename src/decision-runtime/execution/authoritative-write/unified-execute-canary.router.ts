/**
 * UNIFIED_EXECUTE canary routing — XOR Legacy; no dual execution.
 * Selection requires cutover APPROVED_FOR_CANARY (via gate.enabled).
 */

import {
  resolveUnifiedExecuteCanaryGate,
  UWC_UNIFIED_CANARY_MODE,
} from './unified-execute-canary.config';
import {
  admitUnifiedExecuteCanaryRequest,
  type UnifiedExecuteCanaryAdmissionInput,
} from './unified-execute-canary.admit';
import { canaryBucket } from './actions-commit-canary.router';
import {
  decideCanaryLegacyFallback,
  type CanaryFallbackDecision,
} from './actions-commit-canary.router';

export type UnifiedExecuteCanaryRouteDecision = {
  mode: typeof UWC_UNIFIED_CANARY_MODE | 'LEGACY_WITH_SHADOW';
  selectedForCanary: boolean;
  reasonCodes: string[];
  bucket: number;
  percent: number;
};

export function decideUnifiedExecuteCanaryRoute(input: {
  routingKey: string;
  admission: UnifiedExecuteCanaryAdmissionInput;
  env?: NodeJS.ProcessEnv;
}): UnifiedExecuteCanaryRouteDecision {
  const env = input.env ?? process.env;
  const gate = resolveUnifiedExecuteCanaryGate(env);
  const admission = admitUnifiedExecuteCanaryRequest(input.admission, env);
  const bucket = canaryBucket(input.routingKey);

  if (!gate.enabled) {
    return {
      mode: 'LEGACY_WITH_SHADOW',
      selectedForCanary: false,
      reasonCodes: [
        gate.killSwitch
          ? 'KILL_SWITCH'
          : !gate.cutoverTrafficApproved
            ? 'CUTOVER_NOT_APPROVED_FOR_CANARY'
            : 'CANARY_NOT_AUTHORIZED_OR_DISABLED',
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
    mode: UWC_UNIFIED_CANARY_MODE,
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

export { decideCanaryLegacyFallback };
export type { CanaryFallbackDecision };
