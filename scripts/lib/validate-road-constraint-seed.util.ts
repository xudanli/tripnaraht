/**
 * Shared RAG road-constraint seed validation (CI-safe, no DB).
 */
import fs from 'fs';
import { worldEventsFromRagChunks } from '../../src/world/rag-chunks-to-world-events.util';
import type { ChunkRetrievalResult } from '../../src/rag/services/chunk-retrieval.service';

export type RoadConstraintSeedChunk = {
  chunk_id: string;
  type: string;
  category: string;
  content: string;
  metadata: Record<string, unknown>;
};

export type RoadConstraintSeedDoc = {
  countryCode: string;
  chunks: RoadConstraintSeedChunk[];
};

export type ValidateRoadConstraintSeedOptions = {
  /** Must appear in materialized ROAD world events */
  requiredRoadIds?: string[];
  /** Trip dates passed to worldEventsFromRagChunks */
  tripDates?: string[];
  minClosedRoadChunks?: number;
  requireWeatherEvent?: boolean;
};

export type ValidateRoadConstraintSeedResult = {
  ok: boolean;
  errors: string[];
  chunkCount: number;
  eventCount: number;
  roadIds: string[];
};

function validateChunk(c: RoadConstraintSeedChunk, index: number, countryCode: string): string[] {
  const errors: string[] = [];
  const m = c.metadata ?? {};
  const cat = String(m.category ?? c.category ?? '').toUpperCase();
  if (!cat) errors.push(`chunk[${index}] missing category`);
  if (m.countryCode !== countryCode) {
    errors.push(`chunk[${index}] countryCode must be ${countryCode}`);
  }
  const isRoad = cat === 'ROAD_STATUS' || cat === 'TRAFFIC_ALERT' || cat === 'RULES' || cat === 'GATE';
  if (isRoad) {
    const hasRoad =
      typeof m.roadId === 'string' ||
      typeof m.road_id === 'string' ||
      !!(m.structured_data as { f_road_required?: { roads?: unknown[] } })?.f_road_required?.roads?.length;
    if (!hasRoad) errors.push(`chunk[${index}] road chunk missing roadId`);
    if (!m.status) errors.push(`chunk[${index}] road chunk missing status`);
  }
  if (cat === 'RISK_INFO' || cat === 'WEATHER') {
    if (!m.date && !(Array.isArray(m.weather_dates) && m.weather_dates.length)) {
      errors.push(`chunk[${index}] weather/risk chunk missing date or weather_dates`);
    }
  }
  return errors;
}

function toRetrievalResult(c: RoadConstraintSeedChunk): ChunkRetrievalResult {
  return {
    id: c.chunk_id,
    chunkId: c.chunk_id,
    category: c.category,
    content: c.content,
    score: 0.9,
    metadata: c.metadata,
  } as unknown as ChunkRetrievalResult;
}

export function validateRoadConstraintSeedFile(
  seedPath: string,
  options: ValidateRoadConstraintSeedOptions = {},
): ValidateRoadConstraintSeedResult {
  const raw = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as RoadConstraintSeedDoc;
  const countryCode = raw.countryCode;
  const errors: string[] = [];

  if (!countryCode) errors.push('seed missing countryCode');
  if (!Array.isArray(raw.chunks) || raw.chunks.length === 0) {
    errors.push('seed must have chunks[]');
    return { ok: false, errors, chunkCount: 0, eventCount: 0, roadIds: [] };
  }

  for (let i = 0; i < raw.chunks.length; i++) {
    errors.push(...validateChunk(raw.chunks[i], i, countryCode));
  }

  const tripDates = options.tripDates ?? ['2026-01-16'];
  const events = worldEventsFromRagChunks(raw.chunks.map(toRetrievalResult), { tripDates });
  const roadIds = events.filter((e) => e.kind === 'ROAD').map((e) => (e as { roadId: string }).roadId);

  for (const rid of options.requiredRoadIds ?? []) {
    if (!roadIds.includes(rid)) {
      errors.push(`worldEvents must include roadId ${rid}`);
    }
  }
  if (options.requireWeatherEvent !== false && !events.some((e) => e.kind === 'WEATHER')) {
    errors.push('worldEvents must include WEATHER');
  }
  const minClosed = options.minClosedRoadChunks ?? 1;
  const closedRoads = raw.chunks.filter((c) => c.metadata?.status === 'CLOSED' && c.metadata?.roadId);
  if (closedRoads.length < minClosed) {
    errors.push(`seed should have >=${minClosed} CLOSED road chunks`);
  }

  return {
    ok: errors.length === 0,
    errors,
    chunkCount: raw.chunks.length,
    eventCount: events.length,
    roadIds,
  };
}
