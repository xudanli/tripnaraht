/**
 * Signed Gagnaveita collector ingest — validate, persist immutable raw JSON, optional canonical handoff.
 */

import { createHash, randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type {
  GagnaveitaCollectorRawRecord,
  GagnaveitaEvidenceIngestRequest,
  GagnaveitaEvidenceIngestResponse,
} from '../contracts/gagnaveita-evidence-ingest.types';
import { GagnaveitaCollectorCanonicalService } from './gagnaveita-collector-canonical.service';
import { GagnaveitaCollectorReplayStoreService } from './gagnaveita-collector-replay.store';
import { parseGagnaveitaFaerdPayload } from './gagnaveita-collector-parse.util';
import {
  isGagnaveitaCollectorCanonicalProcessingEnabled,
  isGagnaveitaCollectorIngestEnabled,
  resolveGagnaveitaCollectorAllowedIds,
  resolveGagnaveitaCollectorHmacSecret,
  resolveGagnaveitaCollectorSignatureWindowSec,
  verifyGagnaveitaCollectorSignature,
} from './gagnaveita-collector-signature.util';

export const RFC001_GAGNAVEITA_COLLECTOR_RAW_EVIDENCE_KEY =
  'rfc001GagnaveitaCollectorRawEvidence';

@Injectable()
export class GagnaveitaCollectorIngestService {
  private readonly logger = new Logger(GagnaveitaCollectorIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly replayStore: GagnaveitaCollectorReplayStoreService,
    private readonly canonicalService: GagnaveitaCollectorCanonicalService,
  ) {}

  async ingest(body: GagnaveitaEvidenceIngestRequest): Promise<GagnaveitaEvidenceIngestResponse> {
    if (!isGagnaveitaCollectorIngestEnabled()) {
      throw new ForbiddenException('GAGNAVEITA_COLLECTOR_INGEST_DISABLED');
    }

    this.assertContract(body);

    const secret = resolveGagnaveitaCollectorHmacSecret();
    if (!secret) {
      throw new ForbiddenException('GAGNAVEITA_COLLECTOR_HMAC_SECRET unset');
    }
    if (!verifyGagnaveitaCollectorSignature(body, secret)) {
      throw new ForbiddenException('invalid_collector_signature');
    }

    const allowed = resolveGagnaveitaCollectorAllowedIds();
    if (!allowed.has(body.collectorId)) {
      throw new ForbiddenException('collector_id_not_allowed');
    }

    const ts = Date.parse(body.signatureTimestamp);
    const windowSec = resolveGagnaveitaCollectorSignatureWindowSec();
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > windowSec * 1000) {
      throw new BadRequestException('signature_timestamp_out_of_window');
    }

    const hash = createHash('sha256').update(body.payload).digest('hex');
    if (hash !== body.payloadSha256) {
      throw new BadRequestException('payload_sha256_mismatch');
    }

    const replay = await this.replayStore.assertFreshRequest({
      tripId: body.tripId,
      requestId: body.requestId,
      payloadSha256: body.payloadSha256,
    });
    if (replay.ok === false) {
      throw new BadRequestException(replay.reason);
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: body.tripId },
      select: { id: true, destination: true },
    });
    if (!trip || trip.destination !== 'IS') {
      throw new BadRequestException('trip_not_found_or_not_iceland');
    }

    const records = parseGagnaveitaFaerdPayload(body.payload);
    const roadId = (body.roadId ?? 'F208').toUpperCase();
    const ingestId = `gci_${randomUUID()}`;
    const receivedAt = new Date().toISOString();

    const record: GagnaveitaCollectorRawRecord = {
      ingestId,
      requestId: body.requestId,
      tripId: body.tripId,
      roadId,
      collectorId: body.collectorId,
      collectorRegion: body.collectorRegion,
      fetchedAt: body.fetchedAt,
      receivedAt,
      sourceObservedAt: body.sourceObservedAt,
      payloadSha256: body.payloadSha256,
      payload: body.payload,
      signature: body.signature,
      signatureTimestamp: body.signatureTimestamp,
      replayMode: body.replayMode,
      transport: 'remote_collector',
      authoritative: true,
    };

    await this.persistRawRecord(body.tripId, record);
    await this.replayStore.record({
      tripId: body.tripId,
      requestId: body.requestId,
      payloadSha256: body.payloadSha256,
      ingestId,
    });

    this.logger.log(
      `collector ingest stored trip=${body.tripId} road=${roadId} records=${records.length} replay=${body.replayMode ?? 'live'}`,
    );

    const canonicalProcessed = isGagnaveitaCollectorCanonicalProcessingEnabled();
    if (!canonicalProcessed) {
      return {
        ok: true,
        ingestId,
        requestId: body.requestId,
        outcome: 'STORED',
        transport: 'remote_collector',
        authoritative: true,
        sourceProvider: 'vegagerdin_gagnaveita',
        roadSource: 'gagnaveita.vegagerdin.is',
        canonicalProcessed: false,
        roadId,
        detail:
          'raw_json_persisted — set GAGNAVEITA_COLLECTOR_INGEST_CANONICAL=1 for canonical chain',
      };
    }

    try {
      const canonical = await this.canonicalService.processIngest({
        tripId: body.tripId,
        roadId,
        payload: body.payload,
        payloadSha256: body.payloadSha256,
        ingestId,
      });

      return {
        ok: true,
        ingestId,
        requestId: body.requestId,
        outcome: canonical.outcome,
        transport: 'remote_collector',
        authoritative: true,
        sourceProvider: 'vegagerdin_gagnaveita',
        roadSource: 'gagnaveita.vegagerdin.is',
        canonicalProcessed: true,
        roadId: canonical.roadId,
        currentStatus: canonical.currentStatus,
        detail: canonical.detail,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('gagnaveita_road_unmapped:')) {
        return {
          ok: false,
          ingestId,
          requestId: body.requestId,
          outcome: 'GAGNAVEITA_UNAVAILABLE',
          transport: 'remote_collector',
          authoritative: true,
          sourceProvider: 'vegagerdin_gagnaveita',
          roadSource: 'gagnaveita.vegagerdin.is',
          canonicalProcessed: true,
          roadId,
          detail: message,
        };
      }
      throw err;
    }
  }

  private assertContract(body: GagnaveitaEvidenceIngestRequest): void {
    if (body.schemaVersion !== 'gagnaveita.raw.v1') {
      throw new BadRequestException('unsupported_schema_version');
    }
    if (body.provider !== 'vegagerdin_gagnaveita' || body.contentType !== 'application/json') {
      throw new BadRequestException('invalid_provider_or_content_type');
    }
    if (!body.tripId || !body.payload?.trim()) {
      throw new BadRequestException('missing_required_fields');
    }
  }

  private async persistRawRecord(
    tripId: string,
    record: GagnaveitaCollectorRawRecord,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = { ...((trip?.metadata as Record<string, unknown>) ?? {}) };
    const prev =
      (meta[RFC001_GAGNAVEITA_COLLECTOR_RAW_EVIDENCE_KEY] as {
        records?: GagnaveitaCollectorRawRecord[];
      })?.records ?? [];
    meta[RFC001_GAGNAVEITA_COLLECTOR_RAW_EVIDENCE_KEY] = {
      records: [...prev, record].slice(-96),
    };
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(meta) },
    });
  }
}
