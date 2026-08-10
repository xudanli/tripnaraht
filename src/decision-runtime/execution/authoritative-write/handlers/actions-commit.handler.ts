import {
  AUTHORITATIVE_WRITE_CONTRACT_VERSION,
  type AuthoritativeWriteCommand,
  type AuthoritativeWriteResult,
} from '../authoritative-write.types';
import type { CorridorShadowHandler } from '../corridor-handler.types';
import type { ExpectedWriteVersion, ObservedWriteVersion } from '../expected-write-version';
import { CORRIDOR_OCC_STRATEGIES } from '../expected-write-version';
import {
  assertAuthoritativeApplyAllowed,
  runShadowGatePipeline,
} from '../shadow-validate.util';
import { getCorridorWriteTargetProfile } from '../write-target.registry';
import { executeActionsCommitAuthoritativeCanary } from '../actions-commit-canary.executor';

function buildActionsExpected(input: Record<string, unknown>): ExpectedWriteVersion {
  const strategy = CORRIDOR_OCC_STRATEGIES.ACTIONS_COMMIT;
  if (strategy.primary !== 'RESOURCE_VERSION_SET') return { kind: 'NO_VERSION_REQUIRED' };
  const resourceId = String(input.resourceId ?? input.trip_id ?? input.tripId ?? 'trip');
  const expectedVersion =
    input.expectedResourceVersion ??
    input.tripRevision ??
    input.physical_validator_version ??
    input.contextVersion;
  if (expectedVersion === undefined || expectedVersion === null || expectedVersion === '') {
    // Shadow may still capture; OCC evaluate will reject empty set if used
    return {
      kind: 'RESOURCE_VERSION_SET',
      resources: [{ resourceId, expectedVersion: String(input.legacyExpectedVersion ?? 'unknown') }],
    };
  }
  return {
    kind: 'RESOURCE_VERSION_SET',
    resources: [{ resourceId, expectedVersion: expectedVersion as string | number }],
  };
}

function buildActionsObserved(input: Record<string, unknown>): ObservedWriteVersion {
  const resourceId = String(input.resourceId ?? input.trip_id ?? input.tripId ?? 'trip');
  const observed =
    input.observedResourceVersion ??
    input.observedTripRevision ??
    input.observed_physical_validator_version ??
    null;
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

export class ActionsCommitCorridorHandler implements CorridorShadowHandler {
  readonly corridor = 'ACTIONS_COMMIT' as const;
  readonly delegatePath =
    getCorridorWriteTargetProfile('ACTIONS_COMMIT').delegatePath;
  readonly delegateSymbol =
    getCorridorWriteTargetProfile('ACTIONS_COMMIT').delegateSymbol;

  buildCommand(input: Record<string, unknown>): AuthoritativeWriteCommand {
    const profile = getCorridorWriteTargetProfile('ACTIONS_COMMIT');
    const tripId = String(input.trip_id ?? input.tripId ?? '');
    const requestId = String(input.request_id ?? input.requestId ?? '');
    const idemRaw = input.idempotency_key ?? input.idempotencyKey ?? requestId;
    const idem = String(idemRaw || 'missing');
    const contextSignature = String(
      input.context_signature ?? input.contextSignature ?? '',
    );
    const authorityDeny = Boolean(input.authorityDeny);
    const expectedWriteVersion = buildActionsExpected(input);
    const observedWriteVersion = buildActionsObserved(input);

    return {
      schemaId: 'tripnara.authoritative_write_command@v1',
      contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
      corridor: 'ACTIONS_COMMIT',
      writeTargets: profile.writeTargets,
      authority: {
        verdict: authorityDeny ? 'DENY' : 'ALLOW',
        reasonCodes: authorityDeny ? ['LEGACY_HINT_DENY'] : [],
        source: 'actions_commit_legacy_shadow',
      },
      verification: contextSignature
        ? { kind: 'context_signature', token: contextSignature }
        : { kind: 'context_signature' },
      freshness: {
        corridorFreshnessToken: contextSignature || undefined,
      },
      expectedWriteVersion,
      observedWriteVersion,
      idempotency: { key: idem, durability: 'in_memory' },
      audit: {
        tripId,
        requestId: requestId || undefined,
        productSurface: 'Agent Actions',
        requestedAt: new Date().toISOString(),
        actorId: input.actorId ? String(input.actorId) : undefined,
      },
      compensationModel: 'stub_no_side_effects',
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
    const result = executeActionsCommitAuthoritativeCanary({
      tripId: command.audit.tripId,
      requestId: String(command.audit.requestId ?? command.audit.tripId),
      idempotencyKey: command.idempotency.key,
      contextSignature:
        command.verification.kind === 'context_signature'
          ? command.verification.token
          : undefined,
      expectedResourceVersion: legacy.expectedResourceVersion as
        | string
        | number
        | undefined,
      observedResourceVersion: legacy.observedResourceVersion as
        | string
        | number
        | undefined,
      actorId: command.audit.actorId,
    });
    return {
      ...result,
      reasonCodes: [
        ...result.reasonCodes,
        'UWC_CUTOVER_01_D1_ACTIONS_AUTHORITATIVE',
        'GLOBAL_OCC_UNLOCK_AUTHORIZED',
      ],
      corridorResult: {
        ...(result.corridorResult ?? {}),
        authoritative: true,
        cutoverDecision: 'D1',
        dualExecution: false,
      },
    };
  }
}
