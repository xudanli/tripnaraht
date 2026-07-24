/**
 * UWC-1c — corridor-level ExpectedWriteVersion OCC contract.
 *
 * Forbidden substitutes:
 * - two optional strings (basePlanVersionId + contextVersion) as the OCC SSOT
 * - global TravelContext version as write concurrency control
 *
 * Each WriteTarget resolves to PLAN_VERSION | RESOURCE_VERSION_SET | NO_VERSION_REQUIRED.
 */

import type {
  AuthoritativeWriteCorridorId,
  WriteTargetKind,
  WriteTargetRef,
} from './authoritative-write.types';

export const OCC_VERSION_KINDS = [
  'PLAN_VERSION',
  'RESOURCE_VERSION_SET',
  'NO_VERSION_REQUIRED',
] as const;

export type OccVersionKind = (typeof OCC_VERSION_KINDS)[number];

/** Discriminated expected version for the write object(s). */
export type ExpectedWriteVersion =
  | {
      kind: 'PLAN_VERSION';
      expectedPlanVersionId: string;
    }
  | {
      kind: 'RESOURCE_VERSION_SET';
      resources: ReadonlyArray<{
        resourceId: string;
        expectedVersion: string | number;
      }>;
    }
  | {
      kind: 'NO_VERSION_REQUIRED';
    };

/** Observed version captured at the same logical moment as the OCC decision. */
export type ObservedWriteVersion =
  | {
      kind: 'PLAN_VERSION';
      observedPlanVersionId: string | null;
    }
  | {
      kind: 'RESOURCE_VERSION_SET';
      resources: ReadonlyArray<{
        resourceId: string;
        observedVersion: string | number | null;
      }>;
    }
  | {
      kind: 'NO_VERSION_REQUIRED';
    };

export type CorridorOccStrategy = {
  corridor: AuthoritativeWriteCorridorId;
  /**
   * Primary OCC strategy for the corridor command envelope.
   * Derived from authoritative write targets — not TravelContext global version.
   */
  primary: OccVersionKind;
  /** Per WriteTarget kind → OCC kind */
  writeTargetOcc: Partial<Record<WriteTargetKind, OccVersionKind>>;
  notes: string;
};

export const CORRIDOR_OCC_STRATEGIES: Record<
  AuthoritativeWriteCorridorId,
  CorridorOccStrategy
> = {
  UNIFIED_EXECUTE: {
    corridor: 'UNIFIED_EXECUTE',
    primary: 'PLAN_VERSION',
    writeTargetOcc: {
      plan_version: 'PLAN_VERSION',
      effective_plan: 'PLAN_VERSION',
      decision_ledger: 'NO_VERSION_REQUIRED',
      problem_store: 'NO_VERSION_REQUIRED',
      trip_itinerary_item: 'RESOURCE_VERSION_SET',
      trip_metadata: 'RESOURCE_VERSION_SET',
    },
    notes:
      'Primary write object is PlanVersion/effective pointer; itinerary materializer is secondary resource set.',
  },
  ITINERARY_ADJUST: {
    corridor: 'ITINERARY_ADJUST',
    primary: 'RESOURCE_VERSION_SET',
    writeTargetOcc: {
      trip_itinerary_item: 'RESOURCE_VERSION_SET',
      trip_metadata: 'RESOURCE_VERSION_SET',
    },
    notes:
      'Itinerary item / trip revision resources — not PlanVersion and not global TravelContext.',
  },
  ACTIONS_COMMIT: {
    corridor: 'ACTIONS_COMMIT',
    primary: 'RESOURCE_VERSION_SET',
    writeTargetOcc: {
      trip_itinerary_item: 'RESOURCE_VERSION_SET',
      trip_metadata: 'RESOURCE_VERSION_SET',
      side_effect: 'RESOURCE_VERSION_SET',
      agent_action_log: 'NO_VERSION_REQUIRED',
      in_memory_dedup: 'NO_VERSION_REQUIRED',
    },
    notes:
      'Action/resource versions (e.g. physical validator / trip revision). Preview signature is verification, not OCC SSOT.',
  },
};

/** Map a WriteTargetRef to OCC kind using corridor strategy. */
export function resolveWriteTargetOccKind(
  corridor: AuthoritativeWriteCorridorId,
  ref: WriteTargetRef,
): OccVersionKind {
  const strategy = CORRIDOR_OCC_STRATEGIES[corridor];
  return strategy.writeTargetOcc[ref.kind] ?? 'NO_VERSION_REQUIRED';
}

export function resolveWriteTargetsOccKinds(
  corridor: AuthoritativeWriteCorridorId,
  refs: readonly WriteTargetRef[],
): Array<{ ref: WriteTargetRef; occKind: OccVersionKind }> {
  return refs.map((ref) => ({
    ref,
    occKind: resolveWriteTargetOccKind(corridor, ref),
  }));
}

export type OccDecision =
  | {
      decision: 'ALREADY_APPLIED';
      outcome: 'IDEMPOTENT_REPLAY';
      reasonCodes: string[];
    }
  | {
      decision: 'PROCEED';
      outcome: 'APPLIED';
      reasonCodes: string[];
    }
  | {
      decision: 'VERSION_CONFLICT';
      outcome: 'CONFLICT';
      reasonCodes: string[];
      conflictCode: 'FRESHNESS_CONFLICT';
    }
  | {
      decision: 'REJECTED';
      outcome: 'REJECTED';
      reasonCodes: string[];
    };

export type IdempotencyPriorRecord = {
  key: string;
  status: 'APPLIED' | 'FAILED';
};

/**
 * Atomic OCC decision (logical).
 * Order is mandatory:
 * 1) idempotency replay → ALREADY_APPLIED (before freshness)
 * 2) expected vs observed → VERSION_CONFLICT or PROCEED
 *
 * Callers that perform real writes MUST evaluate this inside the same
 * transaction / compare-and-swap as the write (no check-then-write).
 */
export function evaluateAtomicOccDecision(input: {
  idempotencyKey: string;
  prior?: IdempotencyPriorRecord | null;
  expected: ExpectedWriteVersion;
  observed: ObservedWriteVersion;
}): OccDecision {
  const key = input.idempotencyKey?.trim();
  if (!key) {
    return {
      decision: 'REJECTED',
      outcome: 'REJECTED',
      reasonCodes: ['IDEMPOTENCY_KEY_MISSING'],
    };
  }

  // 1) Idempotency before freshness
  if (input.prior?.key === key && input.prior.status === 'APPLIED') {
    return {
      decision: 'ALREADY_APPLIED',
      outcome: 'IDEMPOTENT_REPLAY',
      reasonCodes: ['ALREADY_APPLIED'],
    };
  }

  // 2) Freshness / version match (kinds must align)
  if (input.expected.kind !== input.observed.kind) {
    return {
      decision: 'VERSION_CONFLICT',
      outcome: 'CONFLICT',
      conflictCode: 'FRESHNESS_CONFLICT',
      reasonCodes: [
        'OCC_KIND_MISMATCH',
        `expected=${input.expected.kind}`,
        `observed=${input.observed.kind}`,
      ],
    };
  }

  if (input.expected.kind === 'NO_VERSION_REQUIRED') {
    return {
      decision: 'PROCEED',
      outcome: 'APPLIED',
      reasonCodes: ['OCC_NO_VERSION_REQUIRED'],
    };
  }

  if (input.expected.kind === 'PLAN_VERSION') {
    const expectedId = input.expected.expectedPlanVersionId;
    const observedId =
      input.observed.kind === 'PLAN_VERSION'
        ? input.observed.observedPlanVersionId
        : null;
    if (!expectedId || observedId == null || expectedId !== observedId) {
      return {
        decision: 'VERSION_CONFLICT',
        outcome: 'CONFLICT',
        conflictCode: 'FRESHNESS_CONFLICT',
        reasonCodes: [
          'PLAN_VERSION_MISMATCH',
          `expected=${expectedId}`,
          `observed=${observedId ?? 'null'}`,
        ],
      };
    }
    return {
      decision: 'PROCEED',
      outcome: 'APPLIED',
      reasonCodes: ['OCC_PLAN_VERSION_MATCH'],
    };
  }

  // RESOURCE_VERSION_SET
  const expectedResources =
    input.expected.kind === 'RESOURCE_VERSION_SET' ? input.expected.resources : [];
  const observedResources =
    input.observed.kind === 'RESOURCE_VERSION_SET' ? input.observed.resources : [];
  if (expectedResources.length === 0) {
    return {
      decision: 'REJECTED',
      outcome: 'REJECTED',
      reasonCodes: ['RESOURCE_VERSION_SET_EMPTY'],
    };
  }
  const observedMap = new Map(
    observedResources.map((r) => [r.resourceId, r.observedVersion] as const),
  );
  for (const exp of expectedResources) {
    const obs = observedMap.get(exp.resourceId);
    if (obs === undefined || obs === null || String(obs) !== String(exp.expectedVersion)) {
      return {
        decision: 'VERSION_CONFLICT',
        outcome: 'CONFLICT',
        conflictCode: 'FRESHNESS_CONFLICT',
        reasonCodes: [
          'RESOURCE_VERSION_MISMATCH',
          `resourceId=${exp.resourceId}`,
          `expected=${exp.expectedVersion}`,
          `observed=${obs ?? 'null'}`,
        ],
      };
    }
  }
  return {
    decision: 'PROCEED',
    outcome: 'APPLIED',
    reasonCodes: ['OCC_RESOURCE_VERSION_MATCH'],
  };
}
