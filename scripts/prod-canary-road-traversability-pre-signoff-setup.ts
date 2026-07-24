#!/usr/bin/env npx tsx
/**
 * Traversability T2 — seed Road Canary Trip with vehicle profile metadata.
 *
 * Usage:
 *   ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-traversability-pre-signoff-setup.ts
 *   ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-traversability-pre-signoff-setup.ts --reset --vehicle=2WD
 *   ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-traversability-pre-signoff-setup.ts --reset --vehicle=4WD
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { buildItemSegmentId } from '../src/trips/guardian-decision-core/detection/road-close-impact-analyzer';
import {
  EVIDENCE_DIR,
  ROAD_CANARY_ACTIVITY_ITEM_ID,
  ROAD_CANARY_DAY1_ID,
  ROAD_CANARY_DAY2_ID,
  ROAD_CANARY_DRIVE_ITEM_ID,
  ROAD_CANARY_INITIAL_PLAN_ID,
  ROAD_CANARY_INITIAL_SNAPSHOT_REF,
  ROAD_CANARY_PLACE_ACTIVITY_ID,
  ROAD_CANARY_PLACE_DRIVE_ID,
  ROAD_CANARY_TRIP_ID,
  ROAD_CANARY_USER_ID,
  TRAVERSABILITY_DRILL_STATUS,
  TRAVERSABILITY_EVIDENCE_LABEL,
  TRAVERSABILITY_GO_STATUS,
  WEATHER_CANARY_TRIP_ID,
} from './prod-canary-road-traversability-pre-signoff.constants';
import {
  assertProdDatabase,
  parseVehicleProfile,
  today,
  vehicleCapability,
} from './prod-canary-road-traversability-pre-signoff.util';

function requireProdWrite(): void {
  if (process.env.ROAD_DRILL_ALLOW_PROD !== '1') {
    throw new Error(
      'Set ROAD_DRILL_ALLOW_PROD=1 to write traversability drill trip on tripnara_prod',
    );
  }
}

async function cleanupRoadTrip(prisma: PrismaClient): Promise<void> {
  await prisma.itineraryItem.deleteMany({
    where: { tripDayId: { in: [ROAD_CANARY_DAY1_ID, ROAD_CANARY_DAY2_ID] } },
  });
  await prisma.tripDay.deleteMany({ where: { tripId: ROAD_CANARY_TRIP_ID } });
  await prisma.tripCollaborator.deleteMany({ where: { tripId: ROAD_CANARY_TRIP_ID } });
  await prisma.trip.deleteMany({ where: { id: ROAD_CANARY_TRIP_ID } });
}

async function ensurePlaces(prisma: PrismaClient, now: Date): Promise<void> {
  const places = [
    {
      id: ROAD_CANARY_PLACE_DRIVE_ID,
      uuid: `road-canary-drive-${ROAD_CANARY_PLACE_DRIVE_ID}`,
      nameCN: 'Road Canary F208 Drive',
      nameEN: 'Road Canary F208 Drive',
      category: 'ATTRACTION' as const,
      metadata: {
        lat: 63.9,
        lng: -18.5,
        source: 'road_traversability_drill',
        regionId: 'central_highlands',
      },
      updatedAt: now,
    },
    {
      id: ROAD_CANARY_PLACE_ACTIVITY_ID,
      uuid: `road-canary-activity-${ROAD_CANARY_PLACE_ACTIVITY_ID}`,
      nameCN: 'Road Canary Timed Activity',
      nameEN: 'Road Canary Timed Activity',
      category: 'ATTRACTION' as const,
      metadata: {
        lat: 64.0,
        lng: -19.0,
        source: 'road_traversability_drill',
        regionId: 'central_highlands',
        lastEntryAt: '16:00',
        closesAt: '18:00',
        poiId: 'is.landmannalaugar',
      },
      updatedAt: now,
    },
  ];

  for (const place of places) {
    await prisma.place.upsert({
      where: { id: place.id },
      create: place,
      update: {
        nameCN: place.nameCN,
        nameEN: place.nameEN,
        metadata: place.metadata,
        updatedAt: now,
      },
    });
  }
}

async function main() {
  assertProdDatabase();
  requireProdWrite();

  const reset = process.argv.includes('--reset');
  const vehicleProfile = parseVehicleProfile();
  const capability = vehicleCapability(vehicleProfile);
  const prisma = new PrismaClient();
  const now = new Date();
  const startDate = new Date('2026-07-12T00:00:00.000Z');
  const endDate = new Date('2026-07-14T00:00:00.000Z');
  const segmentId = buildItemSegmentId(ROAD_CANARY_TRIP_ID, ROAD_CANARY_DRIVE_ITEM_ID);

  try {
    if (reset) {
      await cleanupRoadTrip(prisma);
    }

    await ensurePlaces(prisma, now);

    const metadata = {
      revision: 1,
      internalTest: true,
      noRealBooking: true,
      productionCanary: true,
      canaryPurpose: 'ROAD_TRAVERSABILITY_T2',
      roadLiveWriteEnabled: false,
      roadReplayDrillEnabled: true,
      icelandCanary: true,
      rfc001IcelandRoadBindings: {
        byItemId: { [ROAD_CANARY_DRIVE_ITEM_ID]: ['F208'] },
      },
      rfc001VehicleCapability: {
        driveType: capability.driveType,
        vehicleClass: capability.vehicleClass,
        riverCrossingAllowed: capability.riverCrossingAllowed,
        gravelRoadExperience: capability.gravelRoadExperience ?? false,
      },
      roadTraversabilityDrill: {
        vehicleProfile,
        scenarioId: capability.scenarioId,
        profileCatalog: 'data/destination-packs/is/road/is-road-segment-profiles.json',
        segmentProfileId: 'seg-is-f208',
        downstreamActivityId: ROAD_CANARY_ACTIVITY_ITEM_ID,
        lastEntryAt: '16:00',
        closesAt: '18:00',
        routeSegmentId: segmentId,
      },
      rfc001PlanVersions: {
        items: [
          {
            planVersionId: ROAD_CANARY_INITIAL_PLAN_ID,
            tripId: ROAD_CANARY_TRIP_ID,
            status: 'EFFECTIVE',
            createdAt: now.toISOString(),
            createdBy: 'ROAD_TRAVERSABILITY_SETUP',
            operations: [],
            effectiveAt: now.toISOString(),
            materializedPlanSnapshotRef: ROAD_CANARY_INITIAL_SNAPSHOT_REF,
          },
        ],
        effectivePlanVersionId: ROAD_CANARY_INITIAL_PLAN_ID,
        lastUpdatedAt: now.toISOString(),
      },
      rfc001PlanSnapshots: {
        items: [
          {
            snapshotRef: ROAD_CANARY_INITIAL_SNAPSHOT_REF,
            createdAt: now.toISOString(),
            payload: {
              tripId: ROAD_CANARY_TRIP_ID,
              destination: 'IS',
              segments: [
                {
                  segmentId,
                  dayIndex: 1,
                  distanceKm: 120,
                  metadata: {
                    itineraryItemId: ROAD_CANARY_DRIVE_ITEM_ID,
                    roadIds: ['F208'],
                    travelFromPreviousDurationMin: 90,
                  },
                },
              ],
            },
          },
        ],
      },
      rfc001WorldState: { assertions: [], events: [], snapshots: [] },
      rfc001DecisionProblems: { items: [] },
      rfc001DecisionLedger: { records: [] },
    };

    await prisma.trip.upsert({
      where: { id: ROAD_CANARY_TRIP_ID },
      create: {
        id: ROAD_CANARY_TRIP_ID,
        destination: 'IS',
        startDate,
        endDate,
        status: 'PLANNING',
        name: `[ROAD-TRAVERSABILITY] Iceland F208 ${vehicleProfile}`,
        metadata,
        updatedAt: now,
      },
      update: {
        destination: 'IS',
        name: `[ROAD-TRAVERSABILITY] Iceland F208 ${vehicleProfile}`,
        metadata,
        updatedAt: now,
      },
    });

    await prisma.tripDay.upsert({
      where: { id: ROAD_CANARY_DAY1_ID },
      create: { id: ROAD_CANARY_DAY1_ID, tripId: ROAD_CANARY_TRIP_ID, date: startDate },
      update: { date: startDate },
    });
    await prisma.tripDay.upsert({
      where: { id: ROAD_CANARY_DAY2_ID },
      create: {
        id: ROAD_CANARY_DAY2_ID,
        tripId: ROAD_CANARY_TRIP_ID,
        date: new Date('2026-07-13T00:00:00.000Z'),
      },
      update: { date: new Date('2026-07-13T00:00:00.000Z') },
    });

    await prisma.itineraryItem.deleteMany({
      where: { tripDayId: ROAD_CANARY_DAY2_ID },
    });

    await prisma.itineraryItem.create({
      data: {
        id: ROAD_CANARY_DRIVE_ITEM_ID,
        tripDayId: ROAD_CANARY_DAY2_ID,
        placeId: ROAD_CANARY_PLACE_DRIVE_ID,
        type: 'TRANSIT',
        startTime: new Date('2026-07-13T10:00:00.000Z'),
        endTime: new Date('2026-07-13T11:30:00.000Z'),
        note: `[ROAD-TRAVERSABILITY] F208 highland drive (${vehicleProfile})`,
        travelFromPreviousDistance: 120000,
        travelFromPreviousDuration: 90,
        order: 1,
      },
    });
    await prisma.itineraryItem.create({
      data: {
        id: ROAD_CANARY_ACTIVITY_ITEM_ID,
        tripDayId: ROAD_CANARY_DAY2_ID,
        placeId: ROAD_CANARY_PLACE_ACTIVITY_ID,
        type: 'ACTIVITY',
        startTime: new Date('2026-07-13T16:00:00.000Z'),
        endTime: new Date('2026-07-13T18:00:00.000Z'),
        note: '[ROAD-TRAVERSABILITY] Timed activity lastEntryAt=16:00 closesAt=18:00',
        travelFromPreviousDistance: 5000,
        travelFromPreviousDuration: 10,
        order: 2,
      },
    });

    await prisma.tripCollaborator.upsert({
      where: {
        tripId_userId: { tripId: ROAD_CANARY_TRIP_ID, userId: ROAD_CANARY_USER_ID },
      },
      create: {
        id: randomUUID(),
        tripId: ROAD_CANARY_TRIP_ID,
        userId: ROAD_CANARY_USER_ID,
        role: 'OWNER',
        updatedAt: now,
      },
      update: { role: 'OWNER', updatedAt: now },
    });

    const evidence = {
      evidenceType: 'ROAD_TRAVERSABILITY_PRE_SIGNOFF_TRIP_SETUP',
      evidenceLabel: TRAVERSABILITY_EVIDENCE_LABEL,
      drillDefinition: 'Prod Canary Road Traversability T2 Pre-Signoff Drill',
      drillStatus: TRAVERSABILITY_DRILL_STATUS,
      productionCanaryGoStatus: TRAVERSABILITY_GO_STATUS,
      tripId: ROAD_CANARY_TRIP_ID,
      userId: ROAD_CANARY_USER_ID,
      weatherCanaryTripId: WEATHER_CANARY_TRIP_ID,
      weatherCanaryUntouched: true,
      vehicleProfile,
      scenarioId: capability.scenarioId,
      rfc001VehicleCapability: metadata.rfc001VehicleCapability,
      effectivePlanVersionId: ROAD_CANARY_INITIAL_PLAN_ID,
      routeSegmentId: segmentId,
      t1Readiness: 'PENDING_ASSESSOR',
      result: 'READY',
      setupAt: new Date().toISOString(),
    };

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const out = `${EVIDENCE_DIR}/road-traversability-setup-${vehicleProfile.toLowerCase()}-${today()}.json`;
    writeFileSync(out, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
    console.log(`\nWritten: ${out}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
