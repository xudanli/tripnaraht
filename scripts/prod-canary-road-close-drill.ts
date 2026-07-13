#!/usr/bin/env npx tsx
/**
 * Production Canary — Gagnaveita REAL-SHAPE road close replay drill.
 *
 * Chain: Gagnaveita fixture → mapper → ROAD_STATUS_CHANGED → harness pipeline.
 * Does NOT write to prod canary trip DB (in-memory mock prisma).
 *
 * Usage:
 *   npx tsx scripts/prod-canary-road-close-drill.ts
 *   npx tsx scripts/prod-canary-road-close-drill.ts --fixture=scripts/fixtures/gagnaveita-f208-closed-real-shape.json
 */
import 'reflect-metadata';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { buildRoadStatusChangedEvent } from '../src/trips/guardian-decision-core/evidence/road-status-changed.event';
import { mapRealtimeStatusToChangedStatus } from '../src/trips/guardian-decision-core/evidence/road-status-changed.event';
import {
  GAGNAVEITA_CANONICAL_PROVIDER,
  type GagnaveitaRealShapeFixture,
  roadStatusFromGagnaveitaFixture,
  buildRoadStatusFingerprint,
} from '../src/trips/guardian-decision-core/evidence/gagnaveita-faerd.mapper';
import { buildItemSegmentId } from '../src/trips/guardian-decision-core/detection/road-close-impact-analyzer';
import {
  buildIcelandRoadCloseHarnessStack,
  createHarnessScriptPrisma,
} from '../src/trips/guardian-decision-core/e2e/iceland-road-close.harness.util';
import type { PrismaService } from '../src/prisma/prisma.service';

const CANARY_TRIP_ID = 'a0a99999-9999-4999-8999-999999999999';
const CANARY_DRIVE_ITEM = 'item_drive_f208';
const DEFAULT_FIXTURE = 'scripts/fixtures/gagnaveita-f208-closed-real-shape.json';
const EVIDENCE_DIR = 'internal-docs/operations/evidence';

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  return fallback;
}

function canaryTripRow() {
  return {
    metadata: {
      revision: 17,
      rfc001IcelandRoadBindings: {
        byItemId: { [CANARY_DRIVE_ITEM]: ['F208'] },
      },
    },
    updatedAt: new Date('2026-07-10T20:00:00Z'),
    trip: {
      id: CANARY_TRIP_ID,
      destination: 'IS',
      TripDay: [
        {
          id: 'day2',
          date: new Date('2026-07-12'),
          ItineraryItem: [
            {
              id: CANARY_DRIVE_ITEM,
              travelFromPreviousDistance: 120000,
              travelFromPreviousDuration: 90,
              trailId: null,
              Trail: null,
            },
          ],
        },
      ],
    },
  };
}

function loadFixture(path: string): GagnaveitaRealShapeFixture {
  return JSON.parse(readFileSync(path, 'utf8')) as GagnaveitaRealShapeFixture;
}

async function main() {
  const fixturePath = arg('fixture', DEFAULT_FIXTURE)!;
  const fixture = loadFixture(fixturePath);
  const fixtureRaw = readFileSync(fixturePath, 'utf8');
  const fixtureSha256 = createHash('sha256').update(fixtureRaw).digest('hex');

  const roadStatus = roadStatusFromGagnaveitaFixture(fixture);
  if (!roadStatus) {
    throw new Error('fixture did not resolve F208 road status');
  }

  const changedStatus = mapRealtimeStatusToChangedStatus(roadStatus.currentStatus);
  const observedAt = roadStatus.lastVerifiedAt.toISOString();
  const segmentId = buildItemSegmentId(CANARY_TRIP_ID, CANARY_DRIVE_ITEM);
  const fingerprint = buildRoadStatusFingerprint({
    source: GAGNAVEITA_CANONICAL_PROVIDER,
    roadId: roadStatus.roadId,
    status: roadStatus.currentStatus,
    observedAt,
  });

  process.env.RFC001_SHADOW_MODE = '0';

  const mock = createHarnessScriptPrisma({ [CANARY_TRIP_ID]: canaryTripRow() });
  const prisma = mock as unknown as PrismaService;
  const stack = buildIcelandRoadCloseHarnessStack(prisma);

  const event = buildRoadStatusChangedEvent({
    tripId: CANARY_TRIP_ID,
    roadId: roadStatus.roadId,
    status: changedStatus,
    previousStatus: 'OPEN',
    segmentId,
    sourceProvider: GAGNAVEITA_CANONICAL_PROVIDER,
    occurredAt: observedAt,
  });

  const run = await stack.runner.runFullFromEvent(event, {
    bindings: { byItemId: { [CANARY_DRIVE_ITEM]: ['F208'] } },
  });

  const world = await stack.worldStore.readStore(CANARY_TRIP_ID);
  const assertion = world.assertions.find((a) => a.predicate === 'road.status');

  const checks = {
    fixtureLoaded: true,
    mapperResolvedF208: roadStatus.roadId === 'F208',
    replayScenarioClosed: changedStatus === 'CLOSED',
    problemCreated: run.problem !== null,
    workspaceCreated: run.workspace !== null,
    decisionRecorded: run.record !== null,
    assertionRoadClosed: assertion?.payload?.status === 'CLOSED',
    affectedDriveItem: run.problem?.affectedPlanItemIds.includes(CANARY_DRIVE_ITEM) ?? false,
    repairCandidates: (run.workspace?.repairCandidates.length ?? 0) >= 2,
  };

  const pass = Object.values(checks).every(Boolean);

  const evidence = {
    drillId: `prod-canary-road-close-replay-${new Date().toISOString().slice(0, 10)}`,
    generatedAt: new Date().toISOString(),
    mode: 'REPLAY',
    live: false,
    tripId: CANARY_TRIP_ID,
    driveItemId: CANARY_DRIVE_ITEM,
    fixture: {
      path: fixturePath,
      sha256: fixtureSha256,
      meta: fixture.fixtureMeta,
    },
    mappedRoadStatus: {
      roadId: roadStatus.roadId,
      currentStatus: roadStatus.currentStatus,
      changedStatus,
      statusMessage: roadStatus.statusMessage,
      observedAt,
      dataSource: roadStatus.dataSource,
      fingerprint,
      segmentCount: fixture.gagnaveitaRecords.length,
    },
    event: {
      eventType: event.eventType,
      roadId: event.payload.roadId,
      status: event.payload.status,
      sourceProvider: event.payload.sourceProvider,
      segmentId: event.payload.segmentId,
    },
    pipeline: {
      problemId: run.problem?.problemId ?? null,
      semanticCapability: run.problem?.semanticCapability ?? null,
      affectedPlanItemIds: run.problem?.affectedPlanItemIds ?? [],
      candidateCount: run.workspace?.repairCandidates.length ?? 0,
      decisionId: run.record?.decisionId ?? null,
    },
    assertion: assertion
      ? {
          predicate: assertion.predicate,
          status: (assertion.payload as { status?: string }).status,
          evidenceRefs: assertion.source.evidenceRefs,
        }
      : null,
    checks,
    verdict: pass ? 'PASS' : 'FAIL',
    chain:
      'REAL-SHAPE Gagnaveita → mapper → ROAD_STATUS_CHANGED → Assertion → Problem → Repair → Decision',
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const out = join(
    EVIDENCE_DIR,
    `prod-canary-road-close-replay-${new Date().toISOString().slice(0, 10)}.json`,
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
