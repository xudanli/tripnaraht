/**
 * Signed Vedur collector ingest — validate, persist immutable raw XML, optional canonical handoff.
 *
 * Collector MUST NOT decide hazard semantics. TripNARA normalizes after verify.
 */

import { createHash, randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type {
  VedurCollectorRawRecord,
  VedurEvidenceIngestRequest,
  VedurEvidenceIngestResponse,
} from '../contracts/vedur-evidence-ingest.types';
import { VedurCollectorCanonicalService } from './vedur-collector-canonical.service';
import { VedurCollectorReplayStoreService } from './vedur-collector-replay.store';
import {
  isVedurCollectorCanonicalProcessingEnabled,
  isVedurCollectorIngestEnabled,
  resolveVedurCollectorAllowedIds,
  resolveVedurCollectorHmacSecret,
  resolveVedurCollectorSignatureWindowSec,
  verifyVedurCollectorSignature,
} from './vedur-collector-signature.util';
import { parseVedurObservationXml, windMsToKmh } from './vedur-raw-xml.util';

export const RFC001_VEDUR_COLLECTOR_RAW_EVIDENCE_KEY = 'rfc001VedurCollectorRawEvidence';

@Injectable()
export class VedurCollectorIngestService {
  private readonly logger = new Logger(VedurCollectorIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly replayStore: VedurCollectorReplayStoreService,
    private readonly canonicalService: VedurCollectorCanonicalService,
  ) {}

  async ingest(body: VedurEvidenceIngestRequest): Promise<VedurEvidenceIngestResponse> {
    if (!isVedurCollectorIngestEnabled()) {
      throw new ForbiddenException('VEDUR_COLLECTOR_INGEST_DISABLED');
    }

    this.assertContract(body);

    const secret = resolveVedurCollectorHmacSecret();
    if (!secret) {
      throw new ForbiddenException('VEDUR_COLLECTOR_HMAC_SECRET unset');
    }
    if (!verifyVedurCollectorSignature(body, secret)) {
      throw new ForbiddenException('invalid_collector_signature');
    }

    const allowed = resolveVedurCollectorAllowedIds();
    if (!allowed.has(body.collectorId)) {
      throw new ForbiddenException('collector_id_not_allowed');
    }

    const ts = Date.parse(body.signatureTimestamp);
    const windowSec = resolveVedurCollectorSignatureWindowSec();
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
      select: { id: true, destination: true, metadata: true },
    });
    if (!trip || trip.destination !== 'IS') {
      throw new BadRequestException('trip_not_found_or_not_iceland');
    }

    const observation = parseVedurObservationXml(body.payload, body.stationId);
    const ingestId = `vci_${randomUUID()}`;
    const receivedAt = new Date().toISOString();

    const record: VedurCollectorRawRecord = {
      ingestId,
      requestId: body.requestId,
      tripId: body.tripId,
      dayIndex: body.dayIndex,
      collectorId: body.collectorId,
      collectorRegion: body.collectorRegion,
      fetchedAt: body.fetchedAt,
      receivedAt,
      sourceObservedAt: body.sourceObservedAt ?? observation.observedAt,
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

    const windSpeedKmh = windMsToKmh(observation.windSpeedMs);
    const windGustKmh =
      observation.windGustMs != null ? windMsToKmh(observation.windGustMs) : undefined;

    this.logger.log(
      `collector ingest stored trip=${body.tripId} day=${body.dayIndex} station=${observation.stationId} wind=${windSpeedKmh} replay=${body.replayMode ?? 'live'}`,
    );

    const canonicalProcessed = isVedurCollectorCanonicalProcessingEnabled();
    if (!canonicalProcessed) {
      return {
        ok: true,
        ingestId,
        requestId: body.requestId,
        outcome: 'STORED',
        transport: 'remote_collector',
        authoritative: true,
        sourceProvider: 'iceland_met',
        weatherSource: 'vedur.is',
        canonicalProcessed: false,
        detail: 'raw_xml_persisted — set VEDUR_COLLECTOR_INGEST_CANONICAL=1 for canonical chain',
      };
    }

    const canonical = await this.canonicalService.processIngest({
      tripId: body.tripId,
      dayIndex: body.dayIndex,
      observation,
      ingestId,
    });

    return {
      ok: true,
      ingestId,
      requestId: body.requestId,
      outcome: canonical.outcome,
      transport: 'remote_collector',
      authoritative: true,
      sourceProvider: 'iceland_met',
      weatherSource: 'vedur.is',
      canonicalProcessed: true,
      detail: canonical.detail,
      riskTier: canonical.riskTier,
      assertionId: canonical.assertionId,
      eventId: canonical.eventId,
    };
  }

  private assertContract(body: VedurEvidenceIngestRequest): void {
    if (body.schemaVersion !== 'vedur.raw.v1') {
      throw new BadRequestException('unsupported_schema_version');
    }
    if (body.provider !== 'iceland_met' || body.contentType !== 'application/xml') {
      throw new BadRequestException('invalid_provider_or_content_type');
    }
    if (!body.tripId || body.dayIndex == null || !body.payload?.trim()) {
      throw new BadRequestException('missing_required_fields');
    }
  }

  private async persistRawRecord(tripId: string, record: VedurCollectorRawRecord): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = { ...((trip?.metadata as Record<string, unknown>) ?? {}) };
    const prev = (meta[RFC001_VEDUR_COLLECTOR_RAW_EVIDENCE_KEY] as { records?: VedurCollectorRawRecord[] })
      ?.records ?? [];
    meta[RFC001_VEDUR_COLLECTOR_RAW_EVIDENCE_KEY] = {
      records: [...prev, record].slice(-96),
    };
    await this.prisma.trip.update({ where: { id: tripId }, data: { metadata: toInputJsonValue(meta) } });
  }
}
