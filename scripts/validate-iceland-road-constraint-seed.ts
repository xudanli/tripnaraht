#!/usr/bin/env npx ts-node
/**
 * Validate P0 Iceland road-constraint RAG seed against metadata schema + worldEventsFromRagChunks.
 * No DB required — safe for CI.
 *
 *   npm run validate:iceland-road-constraint-seed
 */
import fs from 'fs';
import path from 'path';
import { worldEventsFromRagChunks } from '../src/world/rag-chunks-to-world-events.util';
import type { ChunkRetrievalResult } from '../src/rag/services/chunk-retrieval.service';

const SEED_PATH = path.join(__dirname, '../data/rag/iceland-road-constraint-chunks.p0.json');

type SeedChunk = {
  chunk_id: string;
  type: string;
  category: string;
  content: string;
  metadata: Record<string, unknown>;
};

type SeedDoc = {
  chunks: SeedChunk[];
};

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

function validateChunk(c: SeedChunk, index: number): string[] {
  const errors: string[] = [];
  const m = c.metadata ?? {};
  const cat = String(m.category ?? c.category ?? '').toUpperCase();
  if (!cat) errors.push(`chunk[${index}] missing category`);
  if (m.countryCode !== 'IS') {
    errors.push(`chunk[${index}] countryCode must be IS`);
  }
  const isRoad = cat === 'ROAD_STATUS' || cat === 'TRAFFIC_ALERT' || cat === 'RULES' || cat === 'GATE';
  if (isRoad) {
    const hasRoad =
      typeof m.roadId === 'string' ||
      typeof m.road_id === 'string' ||
      !!(m.structured_data as { f_road_required?: { roads?: unknown[] } })?.f_road_required?.roads
        ?.length;
    if (!hasRoad) errors.push(`chunk[${index}] road chunk missing roadId / f_road_required.roads`);
    if (!m.status) errors.push(`chunk[${index}] road chunk missing status`);
  }
  if (cat === 'RISK_INFO' || cat === 'WEATHER') {
    if (!m.date && !(Array.isArray(m.weather_dates) && m.weather_dates.length)) {
      errors.push(`chunk[${index}] weather/risk chunk missing date or weather_dates`);
    }
  }
  return errors;
}

function toRetrievalResult(c: SeedChunk): ChunkRetrievalResult {
  return {
    id: c.chunk_id,
    chunkId: c.chunk_id,
    category: c.category,
    content: c.content,
    score: 0.9,
    metadata: c.metadata,
  } as unknown as ChunkRetrievalResult;
}

function main(): void {
  const raw = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8')) as SeedDoc;
  assert(Array.isArray(raw.chunks) && raw.chunks.length > 0, 'seed must have chunks[]');

  const allErrors: string[] = [];
  for (let i = 0; i < raw.chunks.length; i++) {
    allErrors.push(...validateChunk(raw.chunks[i], i));
  }

  const retrieval = raw.chunks.map(toRetrievalResult);
  const events = worldEventsFromRagChunks(retrieval, { tripDates: ['2026-01-16'] });
  const roadIds = events.filter((e) => e.kind === 'ROAD').map((e) => (e as { roadId: string }).roadId);

  assert(roadIds.includes('F208'), 'worldEvents must include F208');
  assert(roadIds.includes('IS-R1-SOUTH'), 'worldEvents must include IS-R1-SOUTH');
  assert(events.some((e) => e.kind === 'WEATHER'), 'worldEvents must include WEATHER');

  const closedRoads = raw.chunks.filter(
    (c) => c.metadata?.status === 'CLOSED' && c.metadata?.roadId,
  );
  assert(closedRoads.length >= 2, 'seed should have >=2 CLOSED road chunks for P0');

  if (allErrors.length) {
    console.error('Validation failed:');
    for (const e of allErrors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(
    `OK iceland-road-constraint-seed: ${raw.chunks.length} chunks, ${events.length} world events (${roadIds.join(', ')})`,
  );
}

main();
