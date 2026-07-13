#!/usr/bin/env npx tsx
/**
 * Production Canary — Gagnaveita collector ingest drill (local or HTTP).
 *
 * Verifies signed ingest → raw persist → canonical chain (GAGNAVEITA authority).
 *
 * Usage:
 *   GAGNAVEITA_COLLECTOR_HMAC_SECRET=xxx GAGNAVEITA_COLLECTOR_INGEST_ENABLED=1 \
 *   GAGNAVEITA_COLLECTOR_INGEST_CANONICAL=1 \
 *   npx tsx scripts/prod-canary-gagnaveita-collector-ingest-drill.ts
 *
 * Optional:
 *   --mode=http --base-url=http://127.0.0.1:3000
 *   --fixture=scripts/fixtures/gagnaveita-f208-closed-real-shape.json
 */
import 'reflect-metadata';
import { createHash, randomUUID } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { signGagnaveitaCollectorRequest } from '../src/trips/guardian-decision-core/evidence/gagnaveita-collector-signature.util';
import type { GagnaveitaEvidenceIngestRequest } from '../src/trips/guardian-decision-core/contracts/gagnaveita-evidence-ingest.types';
import { GagnaveitaCollectorIngestService } from '../src/trips/guardian-decision-core/evidence/gagnaveita-collector-ingest.service';
import { RFC001_GAGNAVEITA_COLLECTOR_RAW_EVIDENCE_KEY } from '../src/trips/guardian-decision-core/evidence/gagnaveita-collector-ingest.service';
import { GagnaveitaCollectorReplayStoreService } from '../src/trips/guardian-decision-core/evidence/gagnaveita-collector-replay.store';
import { GagnaveitaCollectorCanonicalService } from '../src/trips/guardian-decision-core/evidence/gagnaveita-collector-canonical.service';
import { GagnaveitaRoadEvidenceStoreService } from '../src/trips/guardian-decision-core/evidence/gagnaveita-road-evidence.store';
import { RFC001_GAGNAVEITA_ROAD_EVIDENCE_METADATA_KEY } from '../src/trips/guardian-decision-core/evidence/gagnaveita-road-evidence.store';
import { EvidenceResolverService } from '../src/trips/guardian-decision-core/evidence/evidence-resolver.service';
import { WorldStateStoreService } from '../src/trips/guardian-decision-core/evidence/world-state-store.service';
import { GAGNAVEITA_COLLECTOR_INGEST_PATH } from '../src/trips/guardian-decision-core/contracts/gagnaveita-evidence-ingest.types';
import type { GagnaveitaRealShapeFixture } from '../src/trips/guardian-decision-core/evidence/gagnaveita-faerd.mapper';
import type { PrismaService } from '../src/prisma/prisma.service';

const CANARY_TRIP_ID = 'a0a99999-9999-4999-8999-999999999999';
const EVIDENCE_DIR = 'internal-docs/operations/evidence';

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  return fallback;
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

function resolveSecret(): string {
  return (
    process.env.GAGNAVEITA_COLLECTOR_HMAC_SECRET?.trim() ??
    process.env.VEDUR_COLLECTOR_HMAC_SECRET?.trim() ??
    ''
  );
}

function loadPayload(fixturePath: string): string {
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = JSON.parse(raw) as GagnaveitaRealShapeFixture | unknown[];
  if (Array.isArray(parsed)) {
    return JSON.stringify(parsed);
  }
  const fixture = parsed as GagnaveitaRealShapeFixture;
  return JSON.stringify(fixture.gagnaveitaRecords);
}

async function buildRequest(fixturePath: string, roadId: string): Promise<GagnaveitaEvidenceIngestRequest> {
  const secret = requireEnv(
    process.env.GAGNAVEITA_COLLECTOR_HMAC_SECRET ? 'GAGNAVEITA_COLLECTOR_HMAC_SECRET' : 'VEDUR_COLLECTOR_HMAC_SECRET',
  );
  process.env.GAGNAVEITA_COLLECTOR_INGEST_ENABLED =
    process.env.GAGNAVEITA_COLLECTOR_INGEST_ENABLED ?? '1';
  process.env.GAGNAVEITA_COLLECTOR_INGEST_CANONICAL =
    process.env.GAGNAVEITA_COLLECTOR_INGEST_CANONICAL ?? '1';

  const payload = loadPayload(fixturePath);
  const payloadSha256 = createHash('sha256').update(payload).digest('hex');
  const requestId = `drill_${randomUUID()}`;
  const signatureTimestamp = new Date().toISOString();

  const body: GagnaveitaEvidenceIngestRequest = {
    schemaVersion: 'gagnaveita.raw.v1',
    tripId: CANARY_TRIP_ID,
    roadId,
    provider: 'vegagerdin_gagnaveita',
    collectorId: 'gagnaveita-collector-pilot',
    collectorRegion: 'devbox-drill',
    fetchedAt: new Date().toISOString(),
    contentType: 'application/json',
    payload,
    payloadSha256,
    requestId,
    signatureTimestamp,
    signature: '',
  };
  body.signature = signGagnaveitaCollectorRequest(body, secret);
  return body;
}

async function createIngestService() {
  const prisma = new PrismaClient();
  await prisma.$connect();
  const prismaService = prisma as unknown as PrismaService;
  const replayStore = new GagnaveitaCollectorReplayStoreService(prismaService);
  const roadStore = new GagnaveitaRoadEvidenceStoreService(prismaService);
  const worldStateStore = new WorldStateStoreService(prismaService);
  const evidenceResolver = new EvidenceResolverService(worldStateStore);
  const canonical = new GagnaveitaCollectorCanonicalService(
    roadStore,
    evidenceResolver,
    worldStateStore,
  );
  const ingest = new GagnaveitaCollectorIngestService(prismaService, replayStore, canonical);
  return {
    ingest,
    disconnect: () => prisma.$disconnect(),
  };
}

async function runDirect(body: GagnaveitaEvidenceIngestRequest) {
  const { ingest, disconnect } = await createIngestService();
  try {
    return await ingest.ingest(body);
  } finally {
    await disconnect();
  }
}

async function runHttp(body: GagnaveitaEvidenceIngestRequest, baseUrl: string) {
  const url = `${baseUrl.replace(/\/$/, '')}${GAGNAVEITA_COLLECTOR_INGEST_PATH}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function verifyTripMetadata() {
  const prisma = new PrismaClient();
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: CANARY_TRIP_ID },
      select: { metadata: true, destination: true },
    });
    if (!trip || trip.destination !== 'IS') {
      throw new Error('canary trip missing or not Iceland');
    }
    const meta = (trip.metadata as Record<string, unknown>) ?? {};
    const raw = meta[RFC001_GAGNAVEITA_COLLECTOR_RAW_EVIDENCE_KEY] as
      | { records?: unknown[] }
      | undefined;
    const road = meta[RFC001_GAGNAVEITA_ROAD_EVIDENCE_METADATA_KEY] as
      | { byRoadId?: Record<string, unknown> }
      | undefined;
    const world = meta.rfc001WorldState as { assertions?: unknown[] } | undefined;
    return {
      rawRecordCount: raw?.records?.length ?? 0,
      roadEvidenceCount: Object.keys(road?.byRoadId ?? {}).length,
      assertionCount: world?.assertions?.length ?? 0,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const mode = arg('mode', 'direct')!;
  const fixturePath =
    arg('fixture', 'scripts/fixtures/gagnaveita-f208-closed-real-shape.json')!;
  const roadId = arg('road-id', 'F208')!;
  const baseUrl = arg('base-url', `http://127.0.0.1:${process.env.PORT ?? '3000'}`)!;

  if (!resolveSecret()) {
    throw new Error('missing GAGNAVEITA_COLLECTOR_HMAC_SECRET or VEDUR_COLLECTOR_HMAC_SECRET');
  }
  process.env.GAGNAVEITA_COLLECTOR_INGEST_ENABLED = '1';
  process.env.GAGNAVEITA_COLLECTOR_INGEST_CANONICAL = '1';
  process.env.GAGNAVEITA_COLLECTOR_ALLOWED_IDS =
    process.env.GAGNAVEITA_COLLECTOR_ALLOWED_IDS ?? 'gagnaveita-collector-pilot';

  const body = await buildRequest(fixturePath, roadId);
  const response = mode === 'http' ? await runHttp(body, baseUrl) : await runDirect(body);
  const meta = await verifyTripMetadata();

  const pass =
    response.ok === true &&
    response.authoritative === true &&
    response.sourceProvider === 'vegagerdin_gagnaveita' &&
    response.roadSource === 'gagnaveita.vegagerdin.is' &&
    response.canonicalProcessed === true &&
    (response.outcome === 'SILENT' || response.outcome === 'ASSERTION_EMITTED') &&
    meta.rawRecordCount >= 1 &&
    meta.roadEvidenceCount >= 1;

  const evidence = {
    evidenceType: 'PRODUCTION_CANARY_GAGNAVEITA_COLLECTOR_INGEST_DRILL',
    probedAt: new Date().toISOString(),
    tripId: CANARY_TRIP_ID,
    roadId,
    mode,
    fixture: fixturePath,
    verdict: pass ? 'GAGNAVEITA_COLLECTOR_INGEST_PASS' : 'GAGNAVEITA_COLLECTOR_INGEST_FAIL',
    roadAuthority: pass ? 'gagnaveita_live_collector' : 'unknown',
    response,
    metadata: meta,
    note:
      'REAL-SHAPE Gagnaveita ingest drill. Does NOT trigger road-close pipeline or Effective Plan write.',
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const out = join(
    EVIDENCE_DIR,
    `prod-canary-gagnaveita-collector-ingest-${new Date().toISOString().slice(0, 10)}.json`,
  );
  writeFileSync(out, JSON.stringify(evidence, null, 2));

  console.log(JSON.stringify(evidence, null, 2));
  console.log(`\nWritten: ${out}`);
  console.log(`\n=== ${evidence.verdict} ===`);

  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
