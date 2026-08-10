import {
  AUTHORITATIVE_WRITE_CONTRACT_VERSION,
  AUTHORITATIVE_WRITE_ERROR_CODES,
  type AuthoritativeWriteCommand,
  type AuthoritativeWriteResult,
} from '../authoritative-write.types';
import type { CorridorShadowHandler } from '../corridor-handler.types';
import type { ExpectedWriteVersion, ObservedWriteVersion } from '../expected-write-version';
import {
  assertAuthoritativeApplyAllowed,
  runShadowGatePipeline,
} from '../shadow-validate.util';
import { getCorridorWriteTargetProfile } from '../write-target.registry';
import {
  executeItineraryAdjustAuthoritativeCanary,
  type ItineraryAdjustCanaryPrisma,
} from '../itinerary-adjust-canary.executor';
import type {
  ItineraryCanaryItemCreate,
  ItineraryCanaryItemReorder,
  ItineraryCanaryTimeUpdate,
} from '../itinerary-adjust-canary.admit';

function buildExpected(input: Record<string, unknown>): ExpectedWriteVersion {
  const resourceId = String(input.tripId ?? input.trip_id ?? 'trip');
  const expectedVersion =
    input.expectedTripRevision ?? input.tripRevision ?? input.legacyExpectedVersion ?? 0;
  return {
    kind: 'RESOURCE_VERSION_SET',
    resources: [{ resourceId, expectedVersion: expectedVersion as string | number }],
  };
}

function buildObserved(input: Record<string, unknown>): ObservedWriteVersion {
  const resourceId = String(input.tripId ?? input.trip_id ?? 'trip');
  const observed =
    input.observedTripRevision ?? input.observedResourceVersion ?? null;
  return {
    kind: 'RESOURCE_VERSION_SET',
    resources: [
      {
        resourceId,
        observedVersion:
          observed === undefined ? null : (observed as string | number | null),
      },
    ],
  };
}

function mutationFamilyReason(input: {
  hasTime: boolean;
  hasRemovals: boolean;
  hasCreates: boolean;
  hasCandidateRemovals: boolean;
  hasReorders: boolean;
  isReduceIntensity: boolean;
  isMultiDayFromCandidates: boolean;
}): string {
  if (
    input.hasTime &&
    input.hasCreates &&
    !input.hasCandidateRemovals &&
    input.isReduceIntensity
  ) {
    return 'SAME_DAY_REDUCE_INTENSITY';
  }
  if (input.hasTime && input.hasCreates && !input.hasCandidateRemovals) {
    return 'SAME_DAY_MOVE_AND_ADD';
  }
  if (input.hasReorders) return 'SAME_DAY_REORDER_ITEMS';
  if (input.hasRemovals) return 'SAME_DAY_REMOVE_ITEM';
  if (input.hasCreates) {
    if (input.hasCandidateRemovals) {
      return input.isMultiDayFromCandidates
        ? 'MULTI_DAY_ADD_FROM_CANDIDATES'
        : 'SAME_DAY_ADD_FROM_CANDIDATES';
    }
    return 'SAME_DAY_ADD_ITEM';
  }
  return 'FROZEN_SAME_DAY_TIME_ADJUST';
}

function uwcFamilyReason(input: {
  hasTime: boolean;
  hasRemovals: boolean;
  hasCreates: boolean;
  hasCandidateRemovals: boolean;
  hasReorders: boolean;
  isReduceIntensity: boolean;
  isMultiDayFromCandidates: boolean;
}): string {
  if (
    input.hasTime &&
    input.hasCreates &&
    !input.hasCandidateRemovals &&
    input.isReduceIntensity
  ) {
    return 'UWC_ITINERARY_SAME_DAY_REDUCE_INTENSITY';
  }
  if (input.hasTime && input.hasCreates && !input.hasCandidateRemovals) {
    return 'UWC_ITINERARY_SAME_DAY_MOVE_AND_ADD';
  }
  if (input.hasReorders) return 'UWC_ITINERARY_SAME_DAY_REORDER_ITEMS';
  if (input.hasRemovals) return 'UWC_ITINERARY_SAME_DAY_REMOVE_ITEM';
  if (input.hasCreates) {
    if (input.hasCandidateRemovals) {
      return input.isMultiDayFromCandidates
        ? 'UWC_ITINERARY_MULTI_DAY_ADD_FROM_CANDIDATES'
        : 'UWC_ITINERARY_SAME_DAY_ADD_FROM_CANDIDATES';
    }
    return 'UWC_ITINERARY_SAME_DAY_ADD_ITEM';
  }
  return 'UWC_CUTOVER_01_D2_FROZEN_SAME_DAY_TIME_ADJUST';
}

export class ItineraryAdjustCorridorHandler implements CorridorShadowHandler {
  readonly corridor = 'ITINERARY_ADJUST' as const;
  readonly delegatePath =
    getCorridorWriteTargetProfile('ITINERARY_ADJUST').delegatePath;
  readonly delegateSymbol =
    getCorridorWriteTargetProfile('ITINERARY_ADJUST').delegateSymbol;

  buildCommand(input: Record<string, unknown>): AuthoritativeWriteCommand {
    const profile = getCorridorWriteTargetProfile('ITINERARY_ADJUST');
    const tripId = String(input.tripId ?? input.trip_id ?? '');
    const requestId = String(input.requestId ?? input.request_id ?? `ia-${tripId}`);
    const hasDraft = Boolean(input.hasPendingDraft ?? input.pending);
    const adviceOnly = Boolean(input.adviceOnly);

    return {
      schemaId: 'tripnara.authoritative_write_command@v1',
      contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
      corridor: 'ITINERARY_ADJUST',
      writeTargets: profile.writeTargets,
      authority: {
        verdict: adviceOnly ? 'DENY' : 'ALLOW',
        reasonCodes: adviceOnly ? ['ADVICE_ONLY'] : [],
        source: 'itinerary_adjust_legacy_shadow',
      },
      verification: hasDraft ? { kind: 'pending_draft' } : { kind: 'pending_draft' },
      freshness: {
        tripRevision:
          typeof input.tripRevision === 'number' ? input.tripRevision : undefined,
      },
      expectedWriteVersion: buildExpected(input),
      observedWriteVersion: buildObserved(input),
      idempotency: { key: requestId, durability: 'request_scoped' },
      audit: {
        tripId,
        requestId,
        productSurface: 'Main Agent',
        requestedAt: new Date().toISOString(),
        actorId: input.userId ? String(input.userId) : undefined,
      },
      compensationModel: 'revision_chain_rollback',
      payload: { legacy: input },
    };
  }

  shadowValidate(command: AuthoritativeWriteCommand) {
    return runShadowGatePipeline(command, 'SHADOW_VALIDATE');
  }

  async authoritativeApply(
    command: AuthoritativeWriteCommand,
  ): Promise<AuthoritativeWriteResult> {
    assertAuthoritativeApplyAllowed(command);
    const legacy = (command.payload?.legacy ?? {}) as Record<string, unknown>;
    const prisma = legacy.prisma as ItineraryAdjustCanaryPrisma | undefined;
    const timeUpdates = legacy.timeUpdates as
      | readonly ItineraryCanaryTimeUpdate[]
      | undefined;
    const itemCreates = legacy.itemCreates as
      | readonly ItineraryCanaryItemCreate[]
      | undefined;
    const candidateRemovals = legacy.candidateRemovals as
      | readonly string[]
      | undefined;
    const itemRemovals = legacy.itemRemovals as readonly string[] | undefined;
    const itemReorders = legacy.itemReorders as
      | readonly ItineraryCanaryItemReorder[]
      | undefined;
    const expectedTripRevision = Number(
      legacy.expectedTripRevision ??
        command.freshness.tripRevision ??
        (command.expectedWriteVersion.kind === 'RESOURCE_VERSION_SET'
          ? command.expectedWriteVersion.resources[0]?.expectedVersion
          : 0),
    );

    const hasTime = Boolean(timeUpdates?.length);
    const hasCreates = Boolean(itemCreates?.length);
    const hasRemovals = Boolean(itemRemovals?.length);
    const hasReorders = Boolean(itemReorders?.length);
    const hasCandidateRemovals = Boolean(candidateRemovals?.length);
    const isReduceIntensity =
      String(legacy.operation ?? '').toLowerCase() ===
        'same_day_reduce_intensity' ||
      (hasTime &&
        hasCreates &&
        !hasCandidateRemovals &&
        Array.isArray(itemCreates) &&
        itemCreates.every(
          (c) =>
            String(c.type ?? '').toUpperCase() === 'REST' &&
            (c.placeId == null || !Number.isFinite(Number(c.placeId))),
        ));
    const isMultiDayFromCandidates =
      String(legacy.operation ?? '').toLowerCase() ===
        'multi_day_add_from_candidates' ||
      (hasCreates &&
        hasCandidateRemovals &&
        Array.isArray(itemCreates) &&
        new Set(
          itemCreates
            .map((c) => String(c.tripDayId ?? '').trim())
            .filter(Boolean),
        ).size >= 2);
    const family = {
      hasTime,
      hasRemovals,
      hasCreates,
      hasCandidateRemovals,
      hasReorders,
      isReduceIntensity,
      isMultiDayFromCandidates,
    };
    if (
      !prisma ||
      !Number.isFinite(expectedTripRevision) ||
      (!hasTime && !hasCreates && !hasRemovals && !hasReorders)
    ) {
      return {
        schemaId: 'tripnara.authoritative_write_result@v1',
        contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
        outcome: 'REJECTED',
        corridor: 'ITINERARY_ADJUST',
        errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY,
        reasonCodes: [
          'ITINERARY_AUTHORITATIVE_REQUIRES_PRISMA_AND_MUTATION',
          uwcFamilyReason(family),
        ],
        writeTargetsTouched: [],
        idempotencyKey: command.idempotency.key,
      };
    }

    const result = await executeItineraryAdjustAuthoritativeCanary({
      prisma,
      tripId: command.audit.tripId,
      idempotencyKey: command.idempotency.key,
      expectedTripRevision,
      timeUpdates,
      itemCreates,
      candidateRemovals,
      itemRemovals,
      itemReorders,
      operation: isMultiDayFromCandidates
        ? 'multi_day_add_from_candidates'
        : isReduceIntensity
          ? 'same_day_reduce_intensity'
          : typeof legacy.operation === 'string'
            ? legacy.operation
            : undefined,
      priorIdempotencyApplied: Boolean(legacy.priorIdempotencyApplied),
    });

    return {
      ...result,
      reasonCodes: [
        ...result.reasonCodes,
        'UWC_CUTOVER_01_D2_ITINERARY_AUTHORITATIVE',
        'GLOBAL_OCC_UNLOCK_AUTHORIZED',
        mutationFamilyReason(family),
      ],
      corridorResult: {
        ...(result.corridorResult ?? {}),
        authoritative: true,
        cutoverDecision: 'D2',
        dualExecution: false,
      },
    };
  }
}
