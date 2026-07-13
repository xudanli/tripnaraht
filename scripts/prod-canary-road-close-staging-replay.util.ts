/**
 * Shared helpers for Gagnaveita REAL-SHAPE road close replay drills.
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
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
  type IcelandRoadCloseHarnessStack,
} from '../src/trips/guardian-decision-core/e2e/iceland-road-close.harness.util';
import type { RoadStatusChangedEvent } from '../src/trips/guardian-decision-core/evidence/road-status-changed.event';
import type { PrismaService } from '../src/prisma/prisma.service';

export const CANARY_TRIP_ID = 'a0a99999-9999-4999-8999-999999999999';
export const CANARY_USER_ID = 'a0a99999-9999-4999-8999-999999999901';
export const CANARY_DRIVE_ITEM = 'item_drive_f208';
export const ROAD_REPLAY_LIVE_SOURCE = 'REAL-SHAPE-ROAD-REPLAY-F208-CLOSED';
export const DEFAULT_CLOSED_FIXTURE = 'scripts/fixtures/gagnaveita-f208-closed-real-shape.json';

export function canaryTripRow() {
  return {
    metadata: {
      revision: 17,
      productionCanary: true,
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

export function loadGagnaveitaFixture(path: string): GagnaveitaRealShapeFixture {
  return JSON.parse(readFileSync(path, 'utf8')) as GagnaveitaRealShapeFixture;
}

export function fixtureSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path, 'utf8')).digest('hex');
}

export interface RoadReplayContext {
  fixturePath: string;
  fixture: GagnaveitaRealShapeFixture;
  stack: IcelandRoadCloseHarnessStack;
  event: RoadStatusChangedEvent;
  fingerprint: string;
  bindings: { byItemId: Record<string, string[]> };
}

export function buildRoadReplayContext(fixturePath: string): RoadReplayContext {
  const fixture = loadGagnaveitaFixture(fixturePath);
  const roadStatus = roadStatusFromGagnaveitaFixture(fixture);
  if (!roadStatus) {
    throw new Error(`fixture did not resolve F208 road status: ${fixturePath}`);
  }

  process.env.RFC001_SHADOW_MODE = '0';

  const mock = createHarnessScriptPrisma({ [CANARY_TRIP_ID]: canaryTripRow() });
  const prisma = mock as unknown as PrismaService;
  const stack = buildIcelandRoadCloseHarnessStack(prisma);

  const changedStatus = mapRealtimeStatusToChangedStatus(roadStatus.currentStatus);
  const fixtureObservedAt = roadStatus.lastVerifiedAt.toISOString();
  /** Staging replay uses wall-clock observedAt so assertion TTL survives A→B→C. */
  const observedAt = new Date().toISOString();
  const segmentId = buildItemSegmentId(CANARY_TRIP_ID, CANARY_DRIVE_ITEM);
  const fingerprint = buildRoadStatusFingerprint({
    source: GAGNAVEITA_CANONICAL_PROVIDER,
    roadId: roadStatus.roadId,
    status: roadStatus.currentStatus,
    observedAt: fixtureObservedAt,
  });

  const event = buildRoadStatusChangedEvent({
    tripId: CANARY_TRIP_ID,
    roadId: roadStatus.roadId,
    status: changedStatus,
    previousStatus: 'OPEN',
    segmentId,
    sourceProvider: GAGNAVEITA_CANONICAL_PROVIDER,
    occurredAt: observedAt,
  });

  return {
    fixturePath,
    fixture,
    stack,
    event,
    fingerprint,
    fixtureObservedAt,
    bindings: { byItemId: { [CANARY_DRIVE_ITEM]: ['F208'] } },
  };
}

export interface AcceptanceCheck {
  id: string;
  pass: boolean;
  detail: string;
}

export function summarizeChecks(checks: AcceptanceCheck[]): boolean {
  return checks.every((c) => c.pass);
}
