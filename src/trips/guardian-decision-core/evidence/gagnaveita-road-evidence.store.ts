/**
 * Trip metadata store for authoritative Gagnaveita road evidence.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type { RoadStatus } from '../../../skills/world/services/road-status-realtime.service';

export const RFC001_GAGNAVEITA_ROAD_EVIDENCE_METADATA_KEY = 'rfc001GagnaveitaRoadEvidence';

export interface GagnaveitaRoadEvidenceRecord {
  roadId: string;
  roadStatus: RoadStatus;
  fingerprint: string;
  observedAt: string;
  payloadSha256: string;
  persistedAt: string;
  collectorIngestId?: string;
}

export interface GagnaveitaRoadPollAuditEntry {
  polledAt: string;
  roadId: string;
  outcome: 'INGESTED' | 'UNCHANGED' | 'UNAVAILABLE' | 'UNMAPPED';
  fingerprint?: string;
  currentStatus?: string;
  detail?: string;
  roadSource?: string;
  sourceProvider?: 'vegagerdin_gagnaveita';
}

interface GagnaveitaRoadEvidenceState {
  byRoadId: Record<string, GagnaveitaRoadEvidenceRecord>;
  polls: GagnaveitaRoadPollAuditEntry[];
}

const MAX_POLL_AUDIT = 96;

@Injectable()
export class GagnaveitaRoadEvidenceStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async getLatest(
    tripId: string,
    roadId: string,
  ): Promise<GagnaveitaRoadEvidenceRecord | undefined> {
    const state = await this.readState(tripId);
    return state.byRoadId[roadId.toUpperCase()];
  }

  async persistRoadStatus(input: {
    tripId: string;
    roadId: string;
    roadStatus: RoadStatus;
    fingerprint: string;
    payloadSha256: string;
    ingestId?: string;
  }): Promise<{ stored: boolean; record: GagnaveitaRoadEvidenceRecord }> {
    const state = await this.readState(input.tripId);
    const key = input.roadId.toUpperCase();
    const prev = state.byRoadId[key];
    const now = new Date().toISOString();

    if (prev?.fingerprint === input.fingerprint) {
      return { stored: false, record: prev };
    }

    const record: GagnaveitaRoadEvidenceRecord = {
      roadId: key,
      roadStatus: input.roadStatus,
      fingerprint: input.fingerprint,
      observedAt: input.roadStatus.lastVerifiedAt.toISOString(),
      payloadSha256: input.payloadSha256,
      persistedAt: now,
      collectorIngestId: input.ingestId,
    };

    state.byRoadId[key] = record;
    await this.writeState(input.tripId, state);
    return { stored: true, record };
  }

  async appendPollAudit(
    tripId: string,
    entry: GagnaveitaRoadPollAuditEntry,
  ): Promise<void> {
    const state = await this.readState(tripId);
    state.polls = [...state.polls, entry].slice(-MAX_POLL_AUDIT);
    await this.writeState(tripId, state);
  }

  private async readState(tripId: string): Promise<GagnaveitaRoadEvidenceState> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const raw = (trip?.metadata as Record<string, unknown> | null)?.[
      RFC001_GAGNAVEITA_ROAD_EVIDENCE_METADATA_KEY
    ] as GagnaveitaRoadEvidenceState | undefined;
    return {
      byRoadId: raw?.byRoadId ?? {},
      polls: raw?.polls ?? [],
    };
  }

  private async writeState(
    tripId: string,
    state: GagnaveitaRoadEvidenceState,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = { ...((trip?.metadata as Record<string, unknown>) ?? {}) };
    meta[RFC001_GAGNAVEITA_ROAD_EVIDENCE_METADATA_KEY] = state;
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(meta) },
    });
  }
}
