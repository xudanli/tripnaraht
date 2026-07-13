#!/usr/bin/env npx tsx
/**
 * Minimal HTTP server for remote collector ingest (Vedur weather + Gagnaveita road).
 * Avoids full Nest bootstrap when prod build is unavailable.
 *
 * POST /internal/evidence/weather/vedur
 * POST /internal/evidence/road/gagnaveita
 */
import 'reflect-metadata';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { PrismaClient } from '@prisma/client';
import { VedurCollectorIngestService } from '../src/trips/guardian-decision-core/evidence/vedur-collector-ingest.service';
import { VedurCollectorReplayStoreService } from '../src/trips/guardian-decision-core/evidence/vedur-collector-replay.store';
import { VedurCollectorCanonicalService } from '../src/trips/guardian-decision-core/evidence/vedur-collector-canonical.service';
import { VedurWeatherEvidenceStoreService } from '../src/trips/guardian-decision-core/evidence/vedur-weather-evidence.store';
import { GagnaveitaCollectorIngestService } from '../src/trips/guardian-decision-core/evidence/gagnaveita-collector-ingest.service';
import { GagnaveitaCollectorReplayStoreService } from '../src/trips/guardian-decision-core/evidence/gagnaveita-collector-replay.store';
import { GagnaveitaCollectorCanonicalService } from '../src/trips/guardian-decision-core/evidence/gagnaveita-collector-canonical.service';
import { GagnaveitaRoadEvidenceStoreService } from '../src/trips/guardian-decision-core/evidence/gagnaveita-road-evidence.store';
import { EvidenceResolverService } from '../src/trips/guardian-decision-core/evidence/evidence-resolver.service';
import { WorldStateStoreService } from '../src/trips/guardian-decision-core/evidence/world-state-store.service';
import { VEDUR_COLLECTOR_INGEST_PATH } from '../src/trips/guardian-decision-core/contracts/vedur-evidence-ingest.types';
import { GAGNAVEITA_COLLECTOR_INGEST_PATH } from '../src/trips/guardian-decision-core/contracts/gagnaveita-evidence-ingest.types';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  fireAssertionPromotion,
  mapVedurCanonicalToPromotionFire,
} from './assertion-promotion-client.util';

const PORT = Number(process.env.PORT ?? '3000');

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function main() {
  if (!process.env.VEDUR_COLLECTOR_HMAC_SECRET?.trim()) {
    throw new Error('Set VEDUR_COLLECTOR_HMAC_SECRET');
  }
  process.env.VEDUR_COLLECTOR_INGEST_ENABLED = process.env.VEDUR_COLLECTOR_INGEST_ENABLED ?? '1';
  process.env.VEDUR_COLLECTOR_INGEST_CANONICAL = process.env.VEDUR_COLLECTOR_INGEST_CANONICAL ?? '1';
  process.env.GAGNAVEITA_COLLECTOR_INGEST_ENABLED =
    process.env.GAGNAVEITA_COLLECTOR_INGEST_ENABLED ?? '1';
  process.env.GAGNAVEITA_COLLECTOR_INGEST_CANONICAL =
    process.env.GAGNAVEITA_COLLECTOR_INGEST_CANONICAL ??
    process.env.VEDUR_COLLECTOR_INGEST_CANONICAL ??
    '1';

  const prisma = new PrismaClient();
  await prisma.$connect();
  const prismaService = prisma as unknown as PrismaService;
  const vedurReplayStore = new VedurCollectorReplayStoreService(prismaService);
  const vedurStore = new VedurWeatherEvidenceStoreService(prismaService);
  const worldStateStore = new WorldStateStoreService(prismaService);
  const evidenceResolver = new EvidenceResolverService(worldStateStore);
  const vedurCanonical = new VedurCollectorCanonicalService(vedurStore, evidenceResolver);
  const vedurIngest = new VedurCollectorIngestService(prismaService, vedurReplayStore, vedurCanonical);

  const gagnaveitaReplayStore = new GagnaveitaCollectorReplayStoreService(prismaService);
  const gagnaveitaRoadStore = new GagnaveitaRoadEvidenceStoreService(prismaService);
  const gagnaveitaCanonical = new GagnaveitaCollectorCanonicalService(
    gagnaveitaRoadStore,
    evidenceResolver,
    worldStateStore,
  );
  const gagnaveitaIngest = new GagnaveitaCollectorIngestService(
    prismaService,
    gagnaveitaReplayStore,
    gagnaveitaCanonical,
  );

  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            service: 'collector-ingest',
            routes: [VEDUR_COLLECTOR_INGEST_PATH, GAGNAVEITA_COLLECTOR_INGEST_PATH],
          }),
        );
        return;
      }

      if (req.method === 'POST' && req.url === VEDUR_COLLECTOR_INGEST_PATH) {
        const raw = await readBody(req);
        const body = JSON.parse(raw);
        const result = await vedurIngest.ingest(body);
        const firePayload = mapVedurCanonicalToPromotionFire({
          tripId: body.tripId,
          dayIndex: body.dayIndex,
          outcome:
            result.outcome === 'ASSERTION_EMITTED' || result.outcome === 'SILENT'
              ? result.outcome
              : 'STORED',
          riskTier: result.riskTier,
          assertionId: result.assertionId,
          eventId: result.eventId,
          ingestId: result.ingestId,
        });
        if (firePayload) {
          void fireAssertionPromotion(firePayload);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      if (req.method === 'POST' && req.url === GAGNAVEITA_COLLECTOR_INGEST_PATH) {
        const raw = await readBody(req);
        const body = JSON.parse(raw);
        const result = await gagnaveitaIngest.ingest(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not_found' }));
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && 'status' in err && typeof (err as { status: number }).status === 'number'
          ? (err as { status: number }).status
          : 500;
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: message }));
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[collector-ingest-server] listening on 0.0.0.0:${PORT}`);
    console.log(`[collector-ingest-server] POST ${VEDUR_COLLECTOR_INGEST_PATH}`);
    console.log(`[collector-ingest-server] POST ${GAGNAVEITA_COLLECTOR_INGEST_PATH}`);
    console.log(`[collector-ingest-server] vedur_canonical=${process.env.VEDUR_COLLECTOR_INGEST_CANONICAL}`);
    console.log(
      `[collector-ingest-server] gagnaveita_canonical=${process.env.GAGNAVEITA_COLLECTOR_INGEST_CANONICAL ?? process.env.VEDUR_COLLECTOR_INGEST_CANONICAL}`,
    );
  });

  const shutdown = async () => {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
