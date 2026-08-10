/**
 * UNIFIED_EXECUTE canary admission — verified PlanVersion-only subtype.
 * mixedTargets / Trip / ItineraryItem / payment / external SE → not admitted (Legacy+Shadow).
 */

import {
  getUnifiedExecuteCanaryOperationAllowlist,
  getUnifiedExecuteCanaryTripAllowlist,
} from './unified-execute-canary.config';

export const UWC_UNIFIED_CANARY_ORIGINAL_CANDIDATE = 'original' as const;

export type UnifiedExecuteCanaryAdmissionInput = {
  tripId: string;
  decisionId: string;
  operation: string;
  /** Must be AUTHORIZED before canary execute. */
  recordStatus?: string;
  selectedCandidateId?: string;
  /** Plan operations on the pending version / candidate — must be empty for round 1. */
  operationCount?: number;
  /** True if itinerary materializer would write Trip/ItineraryItem. */
  wouldMaterializeItinerary?: boolean;
  /** True if any mixed / external / payment side effect is requested. */
  hasExternalSideEffect?: boolean;
  /** True if WriteTargets beyond PlanVersion are required. */
  requiresMixedWriteTargets?: boolean;
  /** Pre-verified freshness / world-state (caller-supplied). */
  verified?: boolean;
};

export type UnifiedExecuteCanaryAdmissionResult = {
  admitted: boolean;
  reasonCodes: string[];
  writeTargets: ReadonlyArray<'PlanVersion'>;
};

export function admitUnifiedExecuteCanaryRequest(
  input: UnifiedExecuteCanaryAdmissionInput,
  env: NodeJS.ProcessEnv = process.env,
): UnifiedExecuteCanaryAdmissionResult {
  const reasonCodes: string[] = [];
  const trips = new Set(getUnifiedExecuteCanaryTripAllowlist(env));
  const ops = new Set(
    getUnifiedExecuteCanaryOperationAllowlist(env).map((o) => o.toLowerCase()),
  );

  if (!trips.has(input.tripId)) {
    reasonCodes.push(`TRIP_NOT_IN_ALLOWLIST:${input.tripId}`);
  }
  if (!ops.has(String(input.operation).toLowerCase())) {
    reasonCodes.push(`OP_NOT_IN_ALLOWLIST:${input.operation}`);
  }
  if (input.recordStatus && input.recordStatus !== 'AUTHORIZED') {
    reasonCodes.push(`RECORD_NOT_AUTHORIZED:${input.recordStatus}`);
  }
  const candidate = String(
    input.selectedCandidateId ?? UWC_UNIFIED_CANARY_ORIGINAL_CANDIDATE,
  );
  if (candidate !== UWC_UNIFIED_CANARY_ORIGINAL_CANDIDATE) {
    reasonCodes.push(`CANDIDATE_NOT_ORIGINAL:${candidate}`);
  }
  if ((input.operationCount ?? 0) > 0) {
    reasonCodes.push(`NON_EMPTY_PLAN_OPERATIONS:${input.operationCount}`);
  }
  if (input.wouldMaterializeItinerary) {
    reasonCodes.push('ITINERARY_MATERIALIZE_FORBIDDEN');
  }
  if (input.hasExternalSideEffect) {
    reasonCodes.push('EXTERNAL_SIDE_EFFECT_FORBIDDEN');
  }
  if (input.requiresMixedWriteTargets) {
    reasonCodes.push('MIXED_WRITE_TARGETS_FORBIDDEN');
  }
  if (input.verified === false) {
    reasonCodes.push('NOT_VERIFIED');
  }

  const blocking = reasonCodes.filter(
    (c) =>
      c.startsWith('TRIP_NOT_IN_ALLOWLIST') ||
      c.startsWith('OP_NOT_IN_ALLOWLIST') ||
      c.startsWith('RECORD_') ||
      c.startsWith('CANDIDATE_') ||
      c.startsWith('NON_EMPTY_') ||
      c.startsWith('ITINERARY_') ||
      c.startsWith('EXTERNAL_') ||
      c.startsWith('MIXED_') ||
      c.startsWith('NOT_VERIFIED'),
  );

  if (blocking.length) {
    return {
      admitted: false,
      reasonCodes: blocking,
      writeTargets: ['PlanVersion'],
    };
  }

  return {
    admitted: true,
    reasonCodes: [
      'VERIFIED_PLAN_VERSION_ONLY',
      'NO_EXTERNAL_SIDE_EFFECT',
      'NO_MIXED_WRITE_TARGETS',
      'WRITE_TARGET_PLAN_VERSION',
    ],
    writeTargets: ['PlanVersion'],
  };
}
