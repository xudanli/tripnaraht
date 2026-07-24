/**
 * Vegagerðin Gagnaveita faerd2017_1 → canonical RoadStatus mapping.
 *
 * Authoritative live source: https://gagnaveita.vegagerdin.is/api/faerd2017_1
 * Transport: Frankfurt collector egress
 */

import type { RoadStatus } from '../../../skills/world/services/road-status-realtime.service';
import type { RoadStatusChangedStatus } from './road-status-changed.event';
import { mapRealtimeStatusToChangedStatus } from './road-status-changed.event';

export const GAGNAVEITA_FAERD2017_URL =
  'https://gagnaveita.vegagerdin.is/api/faerd2017_1' as const;

export const GAGNAVEITA_CANONICAL_PROVIDER = 'vegagerdin_gagnaveita' as const;

export type GagnaveitaAstandYfirbord =
  | 'GREIDFAERT'
  | 'FAERT_FJALLABILUM'
  | 'LOKAD'
  | 'OFAERT_ANNAD'
  | 'EKKI_I_THJONUSTU'
  | 'OTHEKKT'
  | string;

export interface GagnaveitaFaerdRecord {
  IdButur: number;
  DagsSkrad: string;
  StuttNafnButs: string;
  FulltNafnButs: string;
  DagsButurBreyttist: string;
  AstandYfirbord: GagnaveitaAstandYfirbord;
  AstandVidbotaruppl: string | null;
  AstandLysing: string;
  AstandLysingEn: string;
  FrkvAudkenni: string | null;
  FrkvLysing: string | null;
  FrkvLysingEn: string | null;
  AsthunAudkenni: string | null;
  AsthunLysing: string | null;
  AsthunLysingEn: string | null;
  Snjomokstursregla: string | null;
  DagsKeyrtUt: string;
}

export type CanonicalRealtimeStatus = RoadStatus['currentStatus'];

/** Worst-status precedence for F-road rollup across segments. */
const STATUS_PRECEDENCE: Record<CanonicalRealtimeStatus, number> = {
  closed: 4,
  limited: 3,
  unknown: 2,
  open: 1,
};

const ASTAND_TO_CANONICAL: Record<string, CanonicalRealtimeStatus> = {
  GREIDFAERT: 'open',
  FAERT_FJALLABILUM: 'limited',
  LOKAD: 'closed',
  OFAERT_ANNAD: 'closed',
  EKKI_I_THJONUSTU: 'unknown',
  OTHEKKT: 'unknown',
};

const F208_NAME_MARKERS = [/Fjallabaksleið nyrðri/i, /\bF208\b/i];

export function mapAstandYfirbordToCanonicalStatus(
  astand: string,
): CanonicalRealtimeStatus {
  const key = astand.trim().toUpperCase();
  return ASTAND_TO_CANONICAL[key] ?? 'unknown';
}

export function mapAstandToChangedStatus(astand: string): RoadStatusChangedStatus {
  return mapRealtimeStatusToChangedStatus(mapAstandYfirbordToCanonicalStatus(astand));
}

export function resolveRoadIdFromGagnaveitaRecord(record: GagnaveitaFaerdRecord): string | null {
  const haystack = [record.FulltNafnButs, record.StuttNafnButs].filter(Boolean).join(' ');
  if (F208_NAME_MARKERS.some((re) => re.test(haystack))) {
    return 'F208';
  }
  const fRoad = haystack.match(/\bF\d{2,3}\b/i);
  if (fRoad) return fRoad[0].toUpperCase();
  return null;
}

export function isF208GagnaveitaRecord(record: GagnaveitaFaerdRecord): boolean {
  return resolveRoadIdFromGagnaveitaRecord(record) === 'F208';
}

export function pickObservedAt(record: GagnaveitaFaerdRecord): string {
  return record.DagsKeyrtUt || record.DagsSkrad;
}

export function buildRoadStatusFingerprint(input: {
  source: string;
  roadId: string;
  status: CanonicalRealtimeStatus;
  observedAt: string;
}): string {
  return `${input.source}|${input.roadId}|${input.status}|${input.observedAt}`;
}

export function mapGagnaveitaRecordToRoadStatus(
  record: GagnaveitaFaerdRecord,
  roadId: string,
): RoadStatus {
  const currentStatus = mapAstandYfirbordToCanonicalStatus(record.AstandYfirbord);
  const observedAt = pickObservedAt(record);
  const restrictionType =
    record.FrkvLysingEn || record.FrkvLysing || record.AstandVidbotaruppl || undefined;

  return {
    roadId: roadId.toUpperCase(),
    roadName: record.FulltNafnButs || record.StuttNafnButs,
    currentStatus,
    statusMessage: record.AstandLysingEn || record.AstandLysing,
    lastVerifiedAt: new Date(observedAt),
    dataSource: GAGNAVEITA_CANONICAL_PROVIDER,
    apiResponse: record,
    hazards: [],
    confidence: 0.88,
    seasonalFallback: false,
    conditions: restrictionType ? { surface: restrictionType } : undefined,
  };
}

export function rollupRoadStatusFromSegments(
  roadId: string,
  segments: RoadStatus[],
): RoadStatus | null {
  if (segments.length === 0) return null;

  const worst = segments.reduce((acc, seg) =>
    STATUS_PRECEDENCE[seg.currentStatus] > STATUS_PRECEDENCE[acc.currentStatus] ? seg : acc,
  );

  const observedAt = segments
    .map((s) => s.lastVerifiedAt.toISOString())
    .sort()
    .at(-1)!;

  return {
    ...worst,
    roadId: roadId.toUpperCase(),
    lastVerifiedAt: new Date(observedAt),
    apiResponse: {
      rollup: true,
      segmentCount: segments.length,
      segments: segments.map((s) => ({
        segmentId: String((s.apiResponse as GagnaveitaFaerdRecord | undefined)?.IdButur ?? ''),
        currentStatus: s.currentStatus,
        roadName: s.roadName,
      })),
    },
  };
}

export function mapGagnaveitaPayloadToF208Status(
  payload: GagnaveitaFaerdRecord[],
): RoadStatus | null {
  const f208Records = payload.filter(isF208GagnaveitaRecord);
  if (f208Records.length === 0) return null;
  const segments = f208Records.map((r) => mapGagnaveitaRecordToRoadStatus(r, 'F208'));
  return rollupRoadStatusFromSegments('F208', segments);
}

export interface GagnaveitaRealShapeFixtureMeta {
  fixtureId: string;
  replay: boolean;
  live: boolean;
  sourceUrl: string;
  sourceProvider: typeof GAGNAVEITA_CANONICAL_PROVIDER;
  fetchedAt: string;
  egressHost: string;
  egressRegion: string;
  httpStatus: number;
  contentType: string;
  payloadSha256: string;
  roadId: string;
  replayScenario?: 'CLOSED' | 'LIMITED' | 'OPEN';
  replayScenarioNote?: string;
  statusSpliceFromRecordId?: number;
}

export interface GagnaveitaRealShapeFixture {
  fixtureMeta: GagnaveitaRealShapeFixtureMeta;
  gagnaveitaRecords: GagnaveitaFaerdRecord[];
}

export function roadStatusFromGagnaveitaFixture(
  fixture: GagnaveitaRealShapeFixture,
): RoadStatus | null {
  return mapGagnaveitaPayloadToF208Status(fixture.gagnaveitaRecords);
}
