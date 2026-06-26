/**
 * Staging acceptance preflight — connectivity, schema, flags (read-only).
 *
 * Usage:
 *   DATABASE_URL=... npm run gate1:staging-preflight
 *   npm run gate1:staging-preflight -- --quick   # DB + schema only (before backfill)
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import {
  isDecisionRuntimeReadFromProjectionEnabled,
  isRuntimeEventOutboxEnabled,
} from '../src/decision-runtime/decision-runtime.config';
import { isTravelEventStoreEnabled } from '../src/trips/event-store/travel-event-store.config';
import { Gate1LinkedTripAnchorService } from '../src/decision-runtime/services/gate1-linked-trip-anchor.service';

loadEnv({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const quick = process.argv.includes('--quick');
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('FAIL: DATABASE_URL not set');
    process.exit(1);
  }
  if (/tripnara_prod|production/i.test(url)) {
    console.error('FAIL: production DATABASE_URL refused');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ name: 'db_connect', ok: true, detail: 'connected' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    checks.push({ name: 'db_connect', ok: false, detail: msg });
    printAndExit(checks);
    return;
  } finally {
    await prisma.$disconnect();
  }

  const prisma2 = new PrismaClient();
  try {
    try {
      await prisma2.$queryRaw`SELECT COUNT(*)::int AS cnt FROM runtime_event_outbox`;
      checks.push({ name: 'outbox_table', ok: true, detail: 'runtime_event_outbox exists' });
    } catch {
      checks.push({
        name: 'outbox_table',
        ok: false,
        detail: 'missing — run: npx prisma migrate deploy',
      });
    }

    try {
      await prisma2.$queryRaw`SELECT COUNT(*)::int AS cnt FROM travel_events LIMIT 1`;
      checks.push({ name: 'travel_events_table', ok: true, detail: 'ok' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      checks.push({ name: 'travel_events_table', ok: false, detail: msg });
    }
  } finally {
    await prisma2.$disconnect();
  }

  if (!quick) {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    try {
      const coverage = await app.get(Gate1LinkedTripAnchorService).getCoverageReport();
      checks.push({
        name: 'linked_trip_coverage',
        ok: coverage.coveragePct >= 95,
        detail: `${coverage.coveragePct}% (${coverage.withLinkedTrip}/${coverage.totalProjects})`,
      });
    } finally {
      await app.close();
    }
  }

  checks.push({
    name: 'flag_TRAVEL_EVENT_STORE_ENABLED',
    ok: isTravelEventStoreEnabled(),
    detail: String(isTravelEventStoreEnabled()),
  });
  checks.push({
    name: 'flag_RUNTIME_EVENT_OUTBOX_ENABLED',
    ok: isRuntimeEventOutboxEnabled(),
    detail: String(isRuntimeEventOutboxEnabled()),
  });
  if (!quick) {
    checks.push({
      name: 'flag_DECISION_RUNTIME_READ_FROM_PROJECTION',
      ok: true,
      detail: String(isDecisionRuntimeReadFromProjectionEnabled()),
    });
  }

  printAndExit(checks);
}

function printAndExit(checks: Array<{ name: string; ok: boolean; detail: string }>) {
  const failed = checks.filter((c) => !c.ok);
  console.log('=== Staging Preflight ===');
  for (const c of checks) {
    console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}: ${c.detail}`);
  }
  if (failed.length > 0) {
    console.log(`\n${failed.length} check(s) failed — fix before full acceptance.`);
    process.exit(1);
  }
  console.log('\nPreflight passed. Run: npm run gate1:staging-acceptance -- --with-m3');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
