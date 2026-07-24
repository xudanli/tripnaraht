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
      verification: hasDraft
        ? { kind: 'pending_draft' }
        : { kind: 'pending_draft' },
      freshness: {
        tripRevision:
          typeof input.tripRevision === 'number' ? input.tripRevision : undefined,
      },
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
    hardBlockAuthoritativeApply(command);
  }
}
