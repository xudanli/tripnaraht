/**
 * Vedur remote collector — signed ingest request contract (vedur.raw.v1).
 */

export const VEDUR_EVIDENCE_INGEST_SCHEMA_VERSION = 'vedur.raw.v1' as const;

export const VEDUR_COLLECTOR_INGEST_PATH = '/internal/evidence/weather/vedur';

export interface VedurEvidenceIngestRequest {
  schemaVersion: typeof VEDUR_EVIDENCE_INGEST_SCHEMA_VERSION;

  /** Target trip for canonical chain (Production Canary allowlist). */
  tripId: string;
  dayIndex: number;

  provider: 'iceland_met';
  collectorId: string;
  collectorRegion: string;

  stationId?: string;
  regionRef?: string;

  fetchedAt: string;
  sourceObservedAt?: string;
  validUntil?: string;

  contentType: 'application/xml';
  payload: string;
  payloadSha256: string;

  requestId: string;
  signatureTimestamp: string;
  signature: string;

  /** When true, hazard replay from captured Vedur payload (not live poll). */
  replayMode?: 'VEDUR_REAL_PAYLOAD_REPLAY';
}

export interface VedurEvidenceIngestResponse {
  ok: boolean;
  ingestId: string;
  requestId: string;
  outcome: 'STORED' | 'SILENT' | 'ASSERTION_EMITTED' | 'REJECTED' | 'VEDUR_UNAVAILABLE';
  transport: 'remote_collector';
  authoritative: true;
  sourceProvider: 'iceland_met';
  weatherSource: 'vedur.is';
  canonicalProcessed: boolean;
  detail?: string;
  riskTier?: 'CALM' | 'ELEVATED' | 'PROHIBITED';
  assertionId?: string;
  eventId?: string;
}

export interface VedurCollectorRawRecord {
  ingestId: string;
  requestId: string;
  tripId: string;
  dayIndex: number;
  collectorId: string;
  collectorRegion: string;
  collectorEgressIp?: string;
  fetchedAt: string;
  receivedAt: string;
  sourceObservedAt?: string;
  payloadSha256: string;
  payload: string;
  signature: string;
  signatureTimestamp: string;
  replayMode?: string;
  transport: 'remote_collector';
  authoritative: true;
}
