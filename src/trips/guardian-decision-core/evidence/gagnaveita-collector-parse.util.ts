/**
 * Parse Gagnaveita faerd2017_1 JSON payload for collector ingest.
 */

import type { GagnaveitaFaerdRecord } from './gagnaveita-faerd.mapper';
import {
  mapGagnaveitaPayloadToF208Status,
  type GagnaveitaRealShapeFixture,
} from './gagnaveita-faerd.mapper';
import type { RoadStatus } from '../../../skills/world/services/road-status-realtime.service';

export function parseGagnaveitaFaerdPayload(payload: string): GagnaveitaFaerdRecord[] {
  const parsed = JSON.parse(payload) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('gagnaveita_payload_not_array');
  }
  return parsed as GagnaveitaFaerdRecord[];
}

export function mapGagnaveitaPayloadToRoadStatus(
  records: GagnaveitaFaerdRecord[],
  roadId: string,
): RoadStatus | null {
  const normalized = roadId.trim().toUpperCase();
  if (normalized === 'F208') {
    return mapGagnaveitaPayloadToF208Status(records);
  }
  return null;
}

export function roadStatusFromCollectorPayload(input: {
  payload: string;
  roadId: string;
}): { records: GagnaveitaFaerdRecord[]; roadStatus: RoadStatus | null } {
  const records = parseGagnaveitaFaerdPayload(input.payload);
  const roadStatus = mapGagnaveitaPayloadToRoadStatus(records, input.roadId);
  return { records, roadStatus };
}

export function shouldEmitGagnaveitaRoadStatusChange(input: {
  previousFingerprint?: string;
  nextFingerprint: string;
}): boolean {
  return input.previousFingerprint !== input.nextFingerprint;
}

export function fixtureFromCollectorRecords(
  records: GagnaveitaFaerdRecord[],
  meta: GagnaveitaRealShapeFixture['fixtureMeta'],
): GagnaveitaRealShapeFixture {
  return { fixtureMeta: meta, gagnaveitaRecords: records };
}
