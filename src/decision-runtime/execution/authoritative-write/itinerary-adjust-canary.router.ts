/**
 * ITINERARY_ADJUST canary routing — XOR Legacy; no dual execution.
 */

import {
  resolveItineraryAdjustCanaryGate,
  UWC_ITINERARY_CANARY_MODE,
} from './itinerary-adjust-canary.config';
import {
  admitItineraryAdjustCanaryRequest,
  type ItineraryAdjustCanaryAdmissionInput,
} from './itinerary-adjust-canary.admit';
import { canaryBucket } from './actions-commit-canary.router';
import {
  decideCanaryLegacyFallback,
  type CanaryFallbackDecision,
} from './actions-commit-canary.router';

export type ItineraryAdjustCanaryRouteDecision = {
  mode: typeof UWC_ITINERARY_CANARY_MODE | 'LEGACY_WITH_SHADOW';
  selectedForCanary: boolean;
  reasonCodes: string[];
  bucket: number;
  percent: number;
};

export function decideItineraryAdjustCanaryRoute(input: {
  routingKey: string;
  admission: ItineraryAdjustCanaryAdmissionInput;
  env?: NodeJS.ProcessEnv;
}): ItineraryAdjustCanaryRouteDecision {
  const env = input.env ?? process.env;
  const gate = resolveItineraryAdjustCanaryGate(env);
  const admission = admitItineraryAdjustCanaryRequest(input.admission, env);
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
    mode: UWC_ITINERARY_CANARY_MODE,
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
