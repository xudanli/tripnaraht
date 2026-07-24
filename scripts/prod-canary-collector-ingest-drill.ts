#!/usr/bin/env npx tsx
/**
 * Production Canary — Vedur collector ingest drill (local or HTTP).
 *
 * Verifies signed ingest → raw persist → canonical chain (VEDUR_LIVE authority).
 *
 * Usage:
 *   VEDUR_COLLECTOR_HMAC_SECRET=xxx VEDUR_COLLECTOR_INGEST_ENABLED=1 \
 *   VEDUR_COLLECTOR_INGEST_CANONICAL=1 \
 *   npx tsx scripts/prod-canary-collector-ingest-drill.ts
 *
 * Optional:
 *   --mode=http --base-url=http://127.0.0.1:3000
 *   --payload-file=scripts/fixtures/vedur-reykjavik-calm-sample.xml
 */
import 'reflect-metadata';
import { createHash, randomUUID } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { signVedurCollectorRequest } from '../src/trips/guardian-decision-core/evidence/vedur-collector-signature.util';
import type { VedurEvidenceIngestRequest } from '../src/trips/guardian-decision-core/contracts/vedur-evidence-ingest.types';
import { VedurCollectorIngestService } from '../src/trips/guardian-decision-core/evidence/vedur-collector-ingest.service';
import { RFC001_VEDUR_COLLECTOR_RAW_EVIDENCE_KEY } from '../src/trips/guardian-decision-core/evidence/vedur-collector-ingest.service';
import { VedurCollectorReplayStoreService } from '../src/trips/guardian-decision-core/evidence/vedur-collector-replay.store';
import { VedurCollectorCanonicalService } from '../src/trips/guardian-decision-core/evidence/vedur-collector-canonical.service';
import { VedurWeatherEvidenceStoreService } from '../src/trips/guardian-decision-core/evidence/vedur-weather-evidence.store';
import { EvidenceResolverService } from '../src/trips/guardian-decision-core/evidence/evidence-resolver.service';
import { WorldStateStoreService } from '../src/trips/guardian-decision-core/evidence/world-state-store.service';
import { RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY } from '../src/decision-runtime/monitoring/config/iceland-vedur-monitoring.config';
import { VEDUR_COLLECTOR_INGEST_PATH } from '../src/trips/guardian-decision-core/contracts/vedur-evidence-ingest.types';
import type { PrismaService } from '../src/prisma/prisma.service';

const CANARY_TRIP_ID = 'a0a99999-9999-4999-8999-999999999999';

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

async function buildRequest(payloadFile: string, dayIndex: number): Promise<VedurEvidenceIngestRequest> {
  const secret = requireEnv('VEDUR_COLLECTOR_HMAC_SECRET');
  process.env.VEDUR_COLLECTOR_INGEST_ENABLED = process.env.VEDUR_COLLECTOR_INGEST_ENABLED ?? '1';
  process.env.VEDUR_COLLECTOR_INGEST_CANONICAL = process.env.VEDUR_COLLECTOR_INGEST_CANONICAL ?? '1';

  const payload = readFileSync(payloadFile, 'utf8');
  const payloadSha256 = createHash('sha256').update(payload).digest('hex');
  const requestId = `drill_${randomUUID()}`;
  const signatureTimestamp = new Date().toISOString();

  const body: VedurEvidenceIngestRequest = {
    schemaVersion: 'vedur.raw.v1',
    tripId: CANARY_TRIP_ID,
    dayIndex,
    provider: 'iceland_met',
    collectorId: 'vedur-collector-pilot',
    collectorRegion: 'devbox-drill',
    stationId: '1',
    fetchedAt: new Date().toISOString(),
    contentType: 'application/xml',
    payload,
    payloadSha256,
    requestId,
    signatureTimestamp,
    signature: '',
  };
  body.signature = signVedurCollectorRequest(body, secret);
  return body;
}

async function createIngestService(): Promise<{ ingest: VedurCollectorIngestService; disconnect: () => Promise<void> }> {
  const prisma = new PrismaClient();
  await prisma.$connect();
  const prismaService = prisma as unknown as PrismaService;
  const replayStore = new VedurCollectorReplayStoreService(prismaService);
  const vedurStore = new VedurWeatherEvidenceStoreService(prismaService);
  const worldStateStore = new WorldStateStoreService(prismaService);
  const evidenceResolver = new EvidenceResolverService(worldStateStore);
  const canonical = new VedurCollectorCanonicalService(vedurStore, evidenceResolver);
  const ingest = new VedurCollectorIngestService(prismaService, replayStore, canonical);
  return {
    ingest,
    disconnect: () => prisma.$disconnect(),
  };
}

async function runDirect(body: VedurEvidenceIngestRequest) {
  const { ingest, disconnect } = await createIngestService();
  try {
    return await ingest.ingest(body);
  } finally {
    await disconnect();
  }
}

async function runHttp(body: VedurEvidenceIngestRequest, baseUrl: string) {
  const url = `${baseUrl.replace(/\/$/, '')}${VEDUR_COLLECTOR_INGEST_PATH}`;
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
  const { PrismaClient } = await import('@prisma/client');
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
    const raw = meta[RFC001_VEDUR_COLLECTOR_RAW_EVIDENCE_KEY] as { records?: unknown[] } | undefined;
    const vedur = meta[RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY] as { byDayRegion?: Record<string, unknown> } | undefined;
    return {
      rawRecordCount: raw?.records?.length ?? 0,
      vedurRegionCount: Object.keys(vedur?.byDayRegion ?? {}).length,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const mode = arg('mode', 'direct')!;
  const payloadFile = arg('payload-file', 'scripts/fixtures/vedur-reykjavik-calm-sample.xml')!;
  const dayIndex = Number(arg('day-index', '1'));
  const baseUrl = arg('base-url', `http://127.0.0.1:${process.env.PORT ?? '3000'}`)!;

  requireEnv('VEDUR_COLLECTOR_HMAC_SECRET');
  process.env.VEDUR_COLLECTOR_INGEST_ENABLED = '1';
  process.env.VEDUR_COLLECTOR_INGEST_CANONICAL = '1';
  process.env.VEDUR_COLLECTOR_ALLOWED_IDS = process.env.VEDUR_COLLECTOR_ALLOWED_IDS ?? 'vedur-collector-pilot';

  const body = await buildRequest(payloadFile, dayIndex);
  const response =
    mode === 'http' ? await runHttp(body, baseUrl) : await runDirect(body);

  const meta = await verifyTripMetadata();

  const pass =
    response.ok === true &&
    response.authoritative === true &&
    response.sourceProvider === 'iceland_met' &&
    response.weatherSource === 'vedur.is' &&
    response.canonicalProcessed === true &&
    (response.outcome === 'SILENT' || response.outcome === 'ASSERTION_EMITTED') &&
    meta.rawRecordCount >= 1 &&
    meta.vedurRegionCount >= 1;

  const evidence = {
    evidenceType: 'PRODUCTION_CANARY_COLLECTOR_INGEST_DRILL',
    probedAt: new Date().toISOString(),
    tripId: CANARY_TRIP_ID,
    mode,
    verdict: pass ? 'COLLECTOR_INGEST_PASS' : 'COLLECTOR_INGEST_FAIL',
    vedurAuthoritative: pass,
    weatherAuthority: pass ? 'vedur_live_collector' : 'unknown',
    response,
    metadata: meta,
    note: 'Calm Vedur sample expects SILENT outcome with evidence persisted. Does NOT alone satisfy Production Canary GO — formal 24h soak still required.',
  };

  const out = `internal-docs/operations/evidence/prod-canary-collector-ingest-${new Date().toISOString().slice(0, 10)}.json`;
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
