import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { EcoIdentityLedgerSnapshot } from '../../execution-closure-persistence/eco-identity-ledger.types';
import {
  ECO_IDENTITY_LEDGER_METADATA_REVISION_KEY,
  parseEcoIdentityLedgerFromTripMetadata,
  parseEcoLedgerRevisionFromTripMetadata,
  serializeEcoIdentityLedgerForTripMetadata,
} from '../../execution-closure-persistence/eco-identity-ledger-serialization';
import { hydrateEcoLedgerIntoTripWorldState } from '../../execution-closure-persistence/hydrate-eco-ledger-into-state';
import type { TripWorldState } from '../world-model';

/**
 * Persists {@link EcoIdentityLedgerSnapshot} under `Trip.metadata.ecoIdentityLedgerV1` for cold resume / multi-instance handoff.
 */
@Injectable()
export class EcoIdentityLedgerPersistenceService {
  private readonly logger = new Logger(EcoIdentityLedgerPersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Public hook for session loaders / agents — same logic as decision engine hydrate. */
  async hydrateWorldStateIfNeeded(state: TripWorldState): Promise<void> {
    await hydrateEcoLedgerIntoTripWorldState(state, id => this.loadLedgerBundle(id));
  }

  async loadLedgerBundle(
    tripId: string,
  ): Promise<{ ledger?: EcoIdentityLedgerSnapshot; revision: number }> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip?.metadata) {
      return { revision: 0 };
    }
    const meta = trip.metadata as Record<string, unknown>;
    const revision = parseEcoLedgerRevisionFromTripMetadata(meta);
    const ledger = parseEcoIdentityLedgerFromTripMetadata(meta.ecoIdentityLedgerV1);
    return { ledger, revision };
  }

  async loadLedger(tripId: string): Promise<EcoIdentityLedgerSnapshot | undefined> {
    const { ledger } = await this.loadLedgerBundle(tripId);
    return ledger;
  }

  /**
   * Persists ledger and bumps `ecoIdentityLedgerRevision`.
   * When `expectedRevision` is set, aborts if stored revision differs (optimistic lock).
   */
  async saveLedger(
    tripId: string,
    ledger: EcoIdentityLedgerSnapshot,
    opts?: { expectedRevision?: number },
  ): Promise<{ ok: boolean; newRevision?: number; conflict?: boolean }> {
    const wire = serializeEcoIdentityLedgerForTripMetadata(ledger);
    return this.prisma.$transaction(async tx => {
      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });
      if (!trip) {
        this.logger.debug(`saveLedger: trip ${tripId} not found, skip`);
        return { ok: false };
      }
      const prev = (trip.metadata as Record<string, unknown>) ?? {};
      const currentRev = parseEcoLedgerRevisionFromTripMetadata(prev);
      if (
        opts?.expectedRevision !== undefined &&
        opts.expectedRevision !== currentRev
      ) {
        this.logger.warn(
          `saveLedger: revision mismatch for trip ${tripId} (expected ${opts.expectedRevision}, db ${currentRev})`,
        );
        return { ok: false, conflict: true };
      }
      const nextRev = currentRev + 1;
      await tx.trip.update({
        where: { id: tripId },
        data: {
          metadata: JSON.parse(
            JSON.stringify({
              ...prev,
              ecoIdentityLedgerV1: wire,
              [ECO_IDENTITY_LEDGER_METADATA_REVISION_KEY]: nextRev,
            }),
          ) as object,
        },
      });
      return { ok: true, newRevision: nextRev };
    });
  }
}
