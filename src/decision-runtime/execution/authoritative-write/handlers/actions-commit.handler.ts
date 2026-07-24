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
        contextVersion: input.contextVersion as string | number | undefined,
        corridorFreshnessToken: contextSignature || undefined,
      },
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
    hardBlockAuthoritativeApply(command);
  }
}
