#!/usr/bin/env npx tsx
/**
 * ETA-L2-CANARY-01 — smoke test 冰岛南岸 Selected Trip (no full Nest AppModule).
 *
 *   npm run lab:eta-l2-smoke-south-coast
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { TravelTimeEstimatorService } from '../../services/travel-time-estimator.service';
import { PoiHopTravelSegmentService } from '../../services/poi-hop-travel-segment.service';
import { SmartRoutesService } from '../../services/smart-routes.service';
import { GoogleRoutesService } from '../../services/google-routes.service';
import { AmapRoutesService } from '../../services/amap-routes.service';
import { MapboxDirectionsService } from '../../services/mapbox-directions.service';
import { LocationDetectorService } from '../../services/location-detector.service';
import { RouteGeometryService } from '../../services/route-geometry.service';
import { RouteCacheService } from '../../services/route-cache.service';
import { TravelSegmentEnrichmentService } from '../../services/travel-segment-enrichment.service';
import { TravelEtaReconciliationService } from '../../services/travel-eta-reconciliation.service';
import { DEMElevationService } from '../../../trips/dem/services/dem-elevation.service';
import { DEMEffortMetadataService } from '../../../trips/dem/services/dem-effort-metadata.service';
import { DemProfileFromGeometryService } from '../../../trips/dem/services/dem-profile-from-geometry.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  evaluateTravelEtaL2AuthorityGate,
  resolveTravelEtaAuthorityForTrip,
} from '../travel-eta-l2-authority.gate';
import { resolveEffectiveIcelandPlaceCoordinates } from '../../../places/utils/iceland-canonical-poi-coords.util';

const TRIP_ID =
  process.env.TRAVEL_ETA_L2_SMOKE_TRIP_ID ||
  '5945a3ab-75d2-4911-ae82-9647c8c29e96';
const OUT = join(process.cwd(), 'src/transport/ops/lab/.out');

function loadEnableEnv(): void {
  const p = join(OUT, 'eta-l2-selected-trips-enable.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    process.env[t.slice(0, i)] = t.slice(i + 1);
  }
}

async function loadPlaceCoords(
  prisma: PrismaClient,
  placeId: number,
): Promise<{ lat: number; lng: number } | null> {
  const place = await prisma.place.findUnique({
    where: { id: placeId },
    select: { id: true, nameCN: true, nameEN: true, metadata: true },
  });
  if (!place) return null;

  const rows = await prisma.$queryRawUnsafe<Array<{ lat: number; lng: number }>>(
    `SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
     FROM "Place" WHERE id = $1 AND location IS NOT NULL`,
    placeId,
  );
  const lat = rows[0]?.lat != null ? Number(rows[0].lat) : null;
  const lng = rows[0]?.lng != null ? Number(rows[0].lng) : null;

  const effective = resolveEffectiveIcelandPlaceCoordinates({
    id: place.id,
    nameCN: place.nameCN,
    nameEN: place.nameEN,
    metadata: place.metadata,
    lat,
    lng,
  });
  if (effective) return { lat: effective.lat, lng: effective.lng };

  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
}

async function main(): Promise<number> {
  loadEnableEnv();
  process.env.TRAVEL_ETA_L2_SELECTED_TRIP_IDS =
    process.env.TRAVEL_ETA_L2_SELECTED_TRIP_IDS || TRIP_ID;
  process.env.TRAVEL_ETA_L2_CANARY_STAGE =
    process.env.TRAVEL_ETA_L2_CANARY_STAGE || 'selected_trips';
  process.env.TRAVEL_ETA_L2_AUTHORITY_APPROVED =
    process.env.TRAVEL_ETA_L2_AUTHORITY_APPROVED || '1';
  delete process.env.TRAVEL_ETA_L2_KILL_SWITCH;

  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const gate = evaluateTravelEtaL2AuthorityGate({ goldMatrixPresent: true });
  const authority = resolveTravelEtaAuthorityForTrip({
    tripId: TRIP_ID,
    countryCode: 'IS',
    gate,
  });

  const prisma = new PrismaClient() as unknown as PrismaService;
  await (prisma as unknown as PrismaClient).$connect();

  const config = new ConfigService();
  const estimator = new TravelTimeEstimatorService();
  const locationDetector = new LocationDetectorService();
  const google = new GoogleRoutesService(config);
  const amap = new AmapRoutesService(config);
  const mapbox = new MapboxDirectionsService(config);
  const smart = new SmartRoutesService(google, amap, locationDetector, mapbox);
  const cache = new RouteCacheService(undefined);
  const geometry = new RouteGeometryService(
    google,
    amap,
    mapbox,
    locationDetector,
    cache,
  );
  const poiHop = new PoiHopTravelSegmentService(estimator, smart, geometry);
  const demElevation = new DEMElevationService(prisma);
  const demEffort = new DEMEffortMetadataService(prisma, demElevation);
  const demProfile = new DemProfileFromGeometryService(demEffort, demElevation);
  const reconciliation = new TravelEtaReconciliationService();
  const enrich = new TravelSegmentEnrichmentService(
    poiHop,
    demProfile,
    reconciliation,
  );

  const trip = await (prisma as unknown as PrismaClient).trip.findUnique({
    where: { id: TRIP_ID },
    select: { id: true, name: true, destination: true, status: true },
  });
  if (!trip) {
    console.error(`FAIL: trip not found ${TRIP_ID}`);
    await (prisma as unknown as PrismaClient).$disconnect();
    return 1;
  }

  const days = await (prisma as unknown as PrismaClient).tripDay.findMany({
    where: { tripId: TRIP_ID },
    orderBy: { date: 'asc' },
    include: {
      ItineraryItem: {
        orderBy: { startTime: 'asc' },
      },
    },
  });

  type SegRow = Record<string, unknown>;
  const rows: SegRow[] = [];
  let demRanCount = 0;
  let providerKnown = 0;
  let withCoords = 0;

  for (const day of days) {
    const items = day.ItineraryItem.filter((i) => i.placeId);
    for (let i = 0; i < items.length - 1; i++) {
      const fromItem = items[i];
      const toItem = items[i + 1];
      const fromCoords = await loadPlaceCoords(
        prisma as unknown as PrismaClient,
        fromItem.placeId!,
      );
      const toCoords = await loadPlaceCoords(
        prisma as unknown as PrismaClient,
        toItem.placeId!,
      );

      const fromPlace = await (prisma as unknown as PrismaClient).place.findUnique({
        where: { id: fromItem.placeId! },
        select: { nameCN: true, nameEN: true },
      });
      const toPlace = await (prisma as unknown as PrismaClient).place.findUnique({
        where: { id: toItem.placeId! },
        select: { nameCN: true, nameEN: true },
      });
      const fromName = fromPlace?.nameCN || fromPlace?.nameEN || String(fromItem.placeId);
      const toName = toPlace?.nameCN || toPlace?.nameEN || String(toItem.placeId);

      const baseRow: SegRow = {
        dayDate: day.date.toISOString().slice(0, 10),
        from: fromName,
        to: toName,
        fromItemId: fromItem.id,
        toItemId: toItem.id,
      };

      if (!fromCoords || !toCoords) {
        rows.push({ ...baseRow, error: 'MISSING_COORDS' });
        continue;
      }
      withCoords += 1;

      try {
        const result = await enrich.enrich({
          origin: fromCoords,
          destination: toCoords,
          travelMode: toItem.travelMode || 'DRIVING',
          defaultMode: 'DRIVING',
          // Explicit offline planning: no Google/Mapbox/Amap required
          useRouteApi: process.env.TRAVEL_ETA_L2_SMOKE_NO_ROUTE_API === '0' ? true : false,
          tripContext: {
            tripId: TRIP_ID,
            countryCode: 'IS',
            pavedRingRoad: true,
            terrainPolicy: 'AUTO',
            fromItemId: fromItem.id,
            toItemId: toItem.id,
          },
        });
        if (result.demRan) demRanCount += 1;
        if (
          result.eta.provenance.provider !== 'UNKNOWN' &&
          result.eta.providerTraceStatus !== 'UNKNOWN'
        ) {
          providerKnown += 1;
        }
        rows.push({
          ...baseRow,
          baseDurationMin: result.eta.baseDurationMin,
          planningDurationMin: result.eta.planningDurationMin,
          schedulableDurationMin: result.eta.schedulableDurationMin,
          shadowPlanningDurationMin: result.eta.shadowPlanningDurationMin,
          authority: result.eta.authority,
          provider: result.eta.provenance.provider,
          providerTraceStatus: result.eta.providerTraceStatus,
          demRan: result.demRan,
          demSource: result.eta.terrain?.demSource,
          adjustments: result.eta.adjustmentReasons,
          decision: result.decision,
          decisionReasons: result.decisionReasons,
        });
      } catch (e) {
        rows.push({ ...baseRow, error: (e as Error).message });
      }
    }
  }

  process.env.TRAVEL_ETA_L2_KILL_SWITCH = '1';
  const killAuth = resolveTravelEtaAuthorityForTrip({
    tripId: TRIP_ID,
    countryCode: 'IS',
  });
  delete process.env.TRAVEL_ETA_L2_KILL_SWITCH;
  const killOk = killAuth === 'SHADOW';

  const okSegments = rows.filter((r) => !r.error);
  const unexpectedFRoad = okSegments.filter((r) =>
    (r.adjustments as string[] | undefined)?.includes('F_ROAD'),
  );

  const report = {
    schemaId: 'tripnara.travel_eta_l2_south_coast_smoke@v1',
    ok:
      trip.name === '冰岛南岸' &&
      authority === 'AUTHORITATIVE' &&
      gate.authoritativePromotion === true &&
      killOk &&
      withCoords > 0 &&
      unexpectedFRoad.length === 0 &&
      okSegments.length > 0,
    trip: {
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      status: trip.status,
    },
    gate: {
      stage: gate.canaryStage,
      authority,
      authoritativePromotion: gate.authoritativePromotion,
      killSwitchForcesShadow: killOk,
    },
    summary: {
      dayCount: days.length,
      segmentAttempts: rows.length,
      segmentsWithCoords: withCoords,
      enrichedOk: okSegments.length,
      demRanCount,
      providerKnownRate: withCoords ? providerKnown / Math.max(withCoords, 1) : null,
      unexpectedFRoadBuffers: unexpectedFRoad.length,
      authoritativeSchedulableEqualsPlanning: okSegments.every(
        (r) => r.schedulableDurationMin === r.planningDurationMin,
      ),
      reconciliationEvents: reconciliation.listEvents(50).length,
    },
    segments: rows,
  };

  const outPath = join(OUT, 'south-coast-smoke-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  console.error(`\nWrote ${outPath}`);

  await (prisma as unknown as PrismaClient).$disconnect();
  return report.ok ? 0 : 1;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
