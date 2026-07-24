#!/usr/bin/env npx tsx
/**
 * ETA-L2-CANARY-01 — write authoritative ETA into schedule (ItineraryItem + Trip.metadata).
 *
 *   npm run lab:eta-l2-sync-authoritative-eta
 *   npm run lab:eta-l2-sync-authoritative-eta -- --trip-ids=id1,id2
 *
 * Default: 冰岛南岸 (paved control) + 内陆高地F路模板 (highland contrast).
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
import { projectTravelEtaUserEvidence } from '../../contracts/travel-eta-user-evidence.contract';
import { resolveEffectiveIcelandPlaceCoordinates } from '../../../places/utils/iceland-canonical-poi-coords.util';
import type { TravelEtaEnvelopeV1 } from '../../contracts/travel-eta.contract';

const OUT = join(process.cwd(), 'src/transport/ops/lab/.out');

const DEFAULT_TRIPS: Array<{
  tripId: string;
  label: string;
  pavedRingRoad: boolean;
  isFRoad?: boolean;
  roadId?: string;
  highlandRisk?: boolean;
}> = [
  {
    tripId: '5945a3ab-75d2-4911-ae82-9647c8c29e96',
    label: '冰岛南岸',
    pavedRingRoad: true,
  },
  {
    tripId: '15a7f7aa-d26b-41ff-ba94-b3de488214f3',
    label: '冰岛内陆高地F路 5天模板',
    pavedRingRoad: false,
    isFRoad: true,
    roadId: 'F208',
    highlandRisk: true,
  },
];

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

function parseTripOverrides(): string[] | null {
  const arg = process.argv.find((a) => a.startsWith('--trip-ids='));
  if (!arg) return null;
  return arg
    .slice('--trip-ids='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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
  if (lat != null && lng != null) return { lat, lng };
  return null;
}

function buildEnricher(prisma: PrismaService): TravelSegmentEnrichmentService {
  const config = new ConfigService();
  const estimator = new TravelTimeEstimatorService();
  const locationDetector = new LocationDetectorService();
  const google = new GoogleRoutesService(config);
  const amap = new AmapRoutesService(config);
  const mapbox = new MapboxDirectionsService(config);
  const smart = new SmartRoutesService(google, amap, locationDetector, mapbox);
  const cache = new RouteCacheService(undefined);
  const geometry = new RouteGeometryService(google, amap, mapbox, locationDetector, cache);
  const poiHop = new PoiHopTravelSegmentService(estimator, smart, geometry);
  const demElevation = new DEMElevationService(prisma);
  const demEffort = new DEMEffortMetadataService(prisma, demElevation);
  const demProfile = new DemProfileFromGeometryService(demEffort, demElevation);
  const reconciliation = new TravelEtaReconciliationService();
  return new TravelSegmentEnrichmentService(poiHop, demProfile, reconciliation);
}

async function syncOneTrip(
  prisma: PrismaClient,
  enrich: TravelSegmentEnrichmentService,
  cfg: (typeof DEFAULT_TRIPS)[0],
): Promise<Record<string, unknown>> {
  const trip = await prisma.trip.findUnique({
    where: { id: cfg.tripId },
    select: { id: true, name: true, metadata: true },
  });
  if (!trip) {
    return { tripId: cfg.tripId, ok: false, error: 'NOT_FOUND' };
  }

  const days = await prisma.tripDay.findMany({
    where: { tripId: cfg.tripId },
    orderBy: { date: 'asc' },
    include: { ItineraryItem: { orderBy: { startTime: 'asc' } } },
  });

  const tripMeta = (trip.metadata as Record<string, unknown> | null) ?? {};
  const etaByItem: Record<string, TravelEtaEnvelopeV1> = {
    ...((tripMeta.travelEtaByToItemId as Record<string, TravelEtaEnvelopeV1>) ?? {}),
  };
  const evidenceByItem: Record<string, unknown> = {
    ...((tripMeta.travelEtaUserEvidenceByToItemId as Record<string, unknown>) ?? {}),
  };

  let updated = 0;
  let enriched = 0;
  const samples: Array<Record<string, unknown>> = [];

  for (const day of days) {
    const items = day.ItineraryItem.filter((i) => i.placeId);
    for (let i = 0; i < items.length - 1; i++) {
      const fromItem = items[i];
      const toItem = items[i + 1];
      const fromCoords = await loadPlaceCoords(prisma, fromItem.placeId!);
      const toCoords = await loadPlaceCoords(prisma, toItem.placeId!);
      if (!fromCoords || !toCoords) continue;

      const result = await enrich.enrich({
        origin: fromCoords,
        destination: toCoords,
        travelMode: toItem.travelMode || 'DRIVING',
        defaultMode: 'DRIVING',
        useRouteApi: false,
        tripContext: {
          tripId: cfg.tripId,
          countryCode: 'IS',
          pavedRingRoad: cfg.pavedRingRoad,
          isFRoad: cfg.isFRoad,
          roadId: cfg.roadId,
          highlandRisk: cfg.highlandRisk,
          terrainPolicy: 'AUTO',
          fromItemId: fromItem.id,
          toItemId: toItem.id,
        },
      });
      enriched += 1;

      const duration = result.eta.schedulableDurationMin;
      const distance = result.distanceMeters;
      const evidence = projectTravelEtaUserEvidence(result.eta);

      etaByItem[toItem.id] = result.eta;
      evidenceByItem[toItem.id] = evidence;

      await prisma.itineraryItem.update({
        where: { id: toItem.id },
        data: {
          travelFromPreviousDuration: duration,
          travelFromPreviousDistance: distance,
          travelMode: result.travelMode,
        },
      });
      updated += 1;

      if (samples.length < 6) {
        const fromPlace = await prisma.place.findUnique({
          where: { id: fromItem.placeId! },
          select: { nameCN: true, nameEN: true },
        });
        const toPlace = await prisma.place.findUnique({
          where: { id: toItem.placeId! },
          select: { nameCN: true, nameEN: true },
        });
        samples.push({
          from: fromPlace?.nameCN || fromPlace?.nameEN,
          to: toPlace?.nameCN || toPlace?.nameEN,
          base: result.eta.baseDurationMin,
          planning: result.eta.planningDurationMin,
          schedulable: duration,
          adjustments: result.eta.adjustmentReasons,
          decision: result.decision,
          evidenceKind: evidence.kind,
          evidenceBuffer: evidence.extraBufferLabel,
          evidenceBlocked: evidence.blockedTitle,
        });
      }
    }
  }

  await prisma.trip.update({
    where: { id: cfg.tripId },
    data: {
      metadata: {
        ...tripMeta,
        travelEtaByToItemId: etaByItem,
        travelEtaUserEvidenceByToItemId: evidenceByItem,
        travelEtaSyncedAt: new Date().toISOString(),
        travelEtaSyncMode: 'AUTHORITATIVE_CANARY_LAB',
      } as object,
    },
  });

  return {
    tripId: cfg.tripId,
    label: cfg.label || trip.name,
    ok: true,
    enriched,
    updated,
    samples,
  };
}

async function main(): Promise<number> {
  loadEnableEnv();
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const overrides = parseTripOverrides();
  const configs = overrides
    ? overrides.map((tripId) => {
        const known = DEFAULT_TRIPS.find((t) => t.tripId === tripId);
        return (
          known ?? {
            tripId,
            label: tripId,
            pavedRingRoad: false,
            highlandRisk: true,
          }
        );
      })
    : DEFAULT_TRIPS;

  process.env.TRAVEL_ETA_L2_CANARY_STAGE =
    process.env.TRAVEL_ETA_L2_CANARY_STAGE || 'selected_trips';
  process.env.TRAVEL_ETA_L2_AUTHORITY_APPROVED =
    process.env.TRAVEL_ETA_L2_AUTHORITY_APPROVED || '1';
  process.env.TRAVEL_ETA_L2_SELECTED_TRIP_IDS = configs.map((c) => c.tripId).join(',');
  delete process.env.TRAVEL_ETA_L2_KILL_SWITCH;

  const prisma = new PrismaClient();
  await prisma.$connect();
  const enrich = buildEnricher(prisma as unknown as PrismaService);

  const results = [];
  for (const cfg of configs) {
    results.push(await syncOneTrip(prisma, enrich, cfg));
  }

  // refresh whitelist + enable env
  const tripIds = configs.map((c) => c.tripId);
  writeFileSync(
    join(process.cwd(), 'src/transport/ops/travel-eta-l2-selected-trips.whitelist.json'),
    JSON.stringify(
      {
        schemaId: 'tripnara.travel_eta_l2_selected_trips@v1',
        tripIds,
        destinations: ['IS_south_coast', 'IS_highlands_froad'],
        notes:
          'Canary cohort: 冰岛南岸 (paved control) + 内陆高地F路模板 (highland contrast). Synced via lab:eta-l2-sync-authoritative-eta.',
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(
    join(OUT, 'eta-l2-selected-trips-enable.env'),
    [
      '# Generated by lab:eta-l2-sync-authoritative-eta',
      'TRAVEL_ETA_L2_CANARY_STAGE=selected_trips',
      'TRAVEL_ETA_L2_AUTHORITY_APPROVED=1',
      `TRAVEL_ETA_L2_SELECTED_TRIP_IDS=${tripIds.join(',')}`,
      'TRAVEL_ETA_L2_KILL_SWITCH=0',
      '',
    ].join('\n'),
  );

  const report = {
    schemaId: 'tripnara.travel_eta_l2_authoritative_sync@v1',
    ok: results.every((r) => r.ok),
    results,
  };
  writeFileSync(join(OUT, 'authoritative-eta-sync-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));

  await prisma.$disconnect();
  return report.ok ? 0 : 1;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
