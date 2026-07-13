/**
 * Anti-replay ledger for Gagnaveita collector ingest (trip.metadata scoped).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';

export const RFC001_GAGNAVEITA_COLLECTOR_INGEST_LEDGER_KEY =
  'rfc001GagnaveitaCollectorIngestLedger';

interface IngestLedgerEntry {
  requestId: string;
  payloadSha256: string;
  receivedAt: string;
  ingestId: string;
}

interface IngestLedgerState {
  byRequestId: Record<string, IngestLedgerEntry>;
}

const MAX_ENTRIES = 500;

@Injectable()
export class GagnaveitaCollectorReplayStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async assertFreshRequest(input: {
    tripId: string;
    requestId: string;
    payloadSha256: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    const state = await this.readState(input.tripId);
    const prev = state.byRequestId[input.requestId];
    if (prev) {
      if (prev.payloadSha256 === input.payloadSha256) {
        return { ok: false, reason: 'duplicate_request_id' };
      }
      return { ok: false, reason: 'request_id_reuse_conflict' };
    }
    return { ok: true };
  }

  async record(input: {
    tripId: string;
    requestId: string;
    payloadSha256: string;
    ingestId: string;
  }): Promise<void> {
    const state = await this.readState(input.tripId);
    state.byRequestId[input.requestId] = {
      requestId: input.requestId,
      payloadSha256: input.payloadSha256,
      receivedAt: new Date().toISOString(),
      ingestId: input.ingestId,
    };
    const entries = Object.values(state.byRequestId);
    if (entries.length > MAX_ENTRIES) {
      const sorted = entries.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
      state.byRequestId = Object.fromEntries(
        sorted.slice(-MAX_ENTRIES).map((e) => [e.requestId, e]),
      );
    }
    await this.writeState(input.tripId, state);
  }

  private async readState(tripId: string): Promise<IngestLedgerState> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const raw = (trip?.metadata as Record<string, unknown> | null)?.[
      RFC001_GAGNAVEITA_COLLECTOR_INGEST_LEDGER_KEY
    ] as IngestLedgerState | undefined;
    return { byRequestId: raw?.byRequestId ?? {} };
  }

  private async writeState(tripId: string, state: IngestLedgerState): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = { ...((trip?.metadata as Record<string, unknown>) ?? {}) };
    meta[RFC001_GAGNAVEITA_COLLECTOR_INGEST_LEDGER_KEY] = state;
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(meta) },
    });
  }
}
