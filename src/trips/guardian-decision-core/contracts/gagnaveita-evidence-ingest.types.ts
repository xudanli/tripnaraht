/**
 * Gagnaveita remote collector — signed ingest request contract (gagnaveita.raw.v1).
 */

export const GAGNAVEITA_EVIDENCE_INGEST_SCHEMA_VERSION = 'gagnaveita.raw.v1' as const;

export const GAGNAVEITA_COLLECTOR_INGEST_PATH = '/internal/evidence/road/gagnaveita';

export interface GagnaveitaEvidenceIngestRequest {
  schemaVersion: typeof GAGNAVEITA_EVIDENCE_INGEST_SCHEMA_VERSION;

  /** Target trip for canonical chain (Production Canary allowlist). */
  tripId: string;

  /** F-road or binding target (default F208 for canary). */
  roadId?: string;

  provider: 'vegagerdin_gagnaveita';
  collectorId: string;
  collectorRegion: string;

  fetchedAt: string;
  sourceObservedAt?: string;

  contentType: 'application/json';
  /** Full faerd2017_1 JSON array payload. */
  payload: string;
  payloadSha256: string;

  requestId: string;
  signatureTimestamp: string;
  signature: string;

  replayMode?: 'GAGNAVEITA_REAL_PAYLOAD_REPLAY';
}

export interface GagnaveitaEvidenceIngestResponse {
  ok: boolean;
  ingestId: string;
  requestId: string;
  outcome: 'STORED' | 'SILENT' | 'ASSERTION_EMITTED' | 'REJECTED' | 'GAGNAVEITA_UNAVAILABLE';
  transport: 'remote_collector';
  authoritative: true;
  sourceProvider: 'vegagerdin_gagnaveita';
  roadSource: 'gagnaveita.vegagerdin.is';
  canonicalProcessed: boolean;
  roadId?: string;
  currentStatus?: string;
  detail?: string;
}

export interface GagnaveitaCollectorRawRecord {
  ingestId: string;
  requestId: string;
  tripId: string;
  roadId: string;
  collectorId: string;
  collectorRegion: string;
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
