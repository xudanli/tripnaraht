import {
  AUTHORITATIVE_WRITE_CONTRACT_VERSION,
  type AuthoritativeWriteCommand,
  type AuthoritativeWriteResult,
} from '../authoritative-write.types';
import type { CorridorShadowHandler } from '../corridor-handler.types';
import {
  hardBlockAuthoritativeApply,
  runShadowGatePipeline,
} from '../shadow-validate.util';
import { getCorridorWriteTargetProfile } from '../write-target.registry';

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
    hardBlockAuthoritativeApply(command);
  }
}
