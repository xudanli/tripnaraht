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
  executeUnifiedExecuteAuthoritativeCanary,
  type UnifiedExecuteCanaryPrisma,
} from '../unified-execute-canary.executor';

function buildExpected(input: Record<string, unknown>): ExpectedWriteVersion {
  const expectedPlanVersionId = String(
    input.expectedPlanVersionId ??
      input.basePlanVersionId ??
      input.legacyExpectedVersion ??
      '',
  );
  return { kind: 'PLAN_VERSION', expectedPlanVersionId };
}

function buildObserved(input: Record<string, unknown>): ObservedWriteVersion {
  const observed =
    input.observedPlanVersionId ?? input.observedEffectivePlanVersionId ?? null;
  return {
    kind: 'PLAN_VERSION',
    observedPlanVersionId:
      observed === undefined || observed === null ? null : String(observed),
  };
}

export class UnifiedExecuteCorridorHandler implements CorridorShadowHandler {
  readonly corridor = 'UNIFIED_EXECUTE' as const;
  readonly delegatePath =
    getCorridorWriteTargetProfile('UNIFIED_EXECUTE').delegatePath;
  readonly delegateSymbol =
    getCorridorWriteTargetProfile('UNIFIED_EXECUTE').delegateSymbol;

  buildCommand(input: Record<string, unknown>): AuthoritativeWriteCommand {
    const profile = getCorridorWriteTargetProfile('UNIFIED_EXECUTE');
    const tripId = String(input.tripId ?? '');
    const decisionId = String(input.decisionId ?? '');
    const idem = String(
      input.idempotencyKey ?? input.idempotency_key ?? `ue-${decisionId}`,
    );
    const deny = Boolean(input.authorityDeny);

    return {
      schemaId: 'tripnara.authoritative_write_command@v1',
      contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
      corridor: 'UNIFIED_EXECUTE',
      writeTargets: profile.writeTargets,
      authority: {
        verdict: deny ? 'DENY' : 'ALLOW',
        reasonCodes: deny ? ['AUTHORIZE_DENIED'] : [],
        source: 'unified_execute_legacy_shadow',
        decisionId: decisionId || undefined,
      },
      verification: { kind: 'authorize_record' },
      freshness: {
        basePlanVersionId: input.basePlanVersionId
          ? String(input.basePlanVersionId)
          : undefined,
        tripRevision:
          typeof input.tripRevision === 'number' ? input.tripRevision : undefined,
      },
      expectedWriteVersion: buildExpected(input),
      observedWriteVersion: buildObserved(input),
      idempotency: { key: idem, durability: 'durable' },
      audit: {
        tripId,
        requestId: idem,
        correlationId: decisionId || undefined,
        productSurface: 'Unified Decision',
        requestedAt: new Date().toISOString(),
      },
      compensationModel: 'post_effective_compensating_plan_version',
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
    const prisma = legacy.prisma as UnifiedExecuteCanaryPrisma | undefined;
    const decisionId = String(
      legacy.decisionId ??
        command.authority.decisionId ??
        command.audit.correlationId ??
        '',
    );
    const planVersionId = String(
      legacy.planVersionId ?? legacy.pendingPlanVersionId ?? '',
    );
    const expectedEffective =
      command.expectedWriteVersion.kind === 'PLAN_VERSION'
        ? command.expectedWriteVersion.expectedPlanVersionId
        : String(
            legacy.expectedEffectivePlanVersionId ??
              legacy.expectedPlanVersionId ??
              legacy.basePlanVersionId ??
              '',
          );

    if (!prisma || !decisionId || !planVersionId) {
      return {
        schemaId: 'tripnara.authoritative_write_result@v1',
        contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
        outcome: 'REJECTED',
        corridor: 'UNIFIED_EXECUTE',
        errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY,
        reasonCodes: [
          'UNIFIED_AUTHORITATIVE_REQUIRES_PRISMA_DECISION_PLAN_VERSION',
          'UWC_CUTOVER_01_D3_PLAN_VERSION_ONLY',
        ],
        writeTargetsTouched: [],
        idempotencyKey: command.idempotency.key,
      };
    }

    const result = await executeUnifiedExecuteAuthoritativeCanary({
      prisma,
      tripId: command.audit.tripId,
      decisionId,
      idempotencyKey: command.idempotency.key,
      planVersionId,
      expectedEffectivePlanVersionId: expectedEffective || '__none__',
    });

    return {
      ...result,
      reasonCodes: [
        ...result.reasonCodes,
        'UWC_CUTOVER_01_D3_UNIFIED_AUTHORITATIVE',
        'GLOBAL_OCC_UNLOCK_AUTHORIZED',
        'WRITE_TARGET_PLAN_VERSION_ONLY',
        'NO_MIXED_WRITE_TARGETS',
      ],
      corridorResult: {
        ...(result.corridorResult ?? {}),
        authoritative: true,
        cutoverDecision: 'D3',
        dualExecution: false,
        mixedTargetsTouched: false,
      },
    };
  }
}
