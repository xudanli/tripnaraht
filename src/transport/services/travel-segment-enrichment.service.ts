/**
 * ETA-L2-PROD-01 — unique Travel Segment Enrichment entry.
 *
 * Route provider → base ETA + geometry → terrain (policy) → Iceland L2 → travelEta.
 * Sole authoritative writer of planningDurationMin / adjustments / terrain on the envelope.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  type TerrainPolicyMode,
  type TravelEtaAuthority,
  type TravelEtaEnvelopeV1,
} from '../contracts/travel-eta.contract';
import { DemProfileFromGeometryService } from '../../trips/dem/services/dem-profile-from-geometry.service';
import {
  PoiHopTravelSegmentService,
  type TripDefaultTravelMode,
} from './poi-hop-travel-segment.service';
import { resolveTerrainPolicy } from '../utils/terrain-policy.util';
import {
  applyIcelandPlanningEtaAdjustment,
  type IcelandL2Decision,
  type IcelandL2RoadStatus,
  type IcelandL2Vehicle,
} from './iceland-planning-eta-adjustment.util';
import {
  applyProviderUnknownAuthorityGuard,
  resolveTravelEtaAuthorityForTrip,
} from '../ops/travel-eta-l2-authority.gate';
import { TravelEtaReconciliationService } from './travel-eta-reconciliation.service';

export interface TravelSegmentEnrichTripContext {
  tripId?: string;
  countryCode?: string;
  roadId?: string;
  isFRoad?: boolean;
  highlandRisk?: boolean;
  roadStatus?: IcelandL2RoadStatus;
  activityType?: string;
  needsTerrainEvidence?: boolean;
  needsVehicleFit?: boolean;
  month?: number;
  pavedRingRoad?: boolean;
  terrainPolicy?: TerrainPolicyMode;
  /** Force includeTerrain legacy → REQUIRED */
  includeTerrain?: boolean;
  authority?: TravelEtaAuthority;
  fromItemId?: string;
  toItemId?: string;
  /** Skip reconciliation emit (tests / hot paths) */
  skipReconciliation?: boolean;
}

export interface TravelSegmentEnrichInput {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  travelMode?: string | null;
  defaultMode?: TripDefaultTravelMode;
  departureTime?: Date | string;
  vehicle?: IcelandL2Vehicle;
  tripContext?: TravelSegmentEnrichTripContext;
  useRouteApi?: boolean;
}

export interface TravelSegmentEnrichResult {
  durationMinutes: number;
  distanceMeters: number;
  travelMode: string;
  source: 'route_api' | 'heuristic';
  eta: TravelEtaEnvelopeV1;
  decision: IcelandL2Decision;
  decisionReasons: string[];
  terrainPolicyMode: TerrainPolicyMode;
  demRan: boolean;
}

@Injectable()
export class TravelSegmentEnrichmentService {
  private readonly logger = new Logger(TravelSegmentEnrichmentService.name);

  constructor(
    private readonly poiHop: PoiHopTravelSegmentService,
    @Optional() private readonly demProfile?: DemProfileFromGeometryService,
    @Optional() private readonly reconciliation?: TravelEtaReconciliationService,
  ) {}

  async enrich(input: TravelSegmentEnrichInput): Promise<TravelSegmentEnrichResult> {
    const hop = await this.poiHop.resolveSegment({
      from: input.origin,
      to: input.destination,
      preferredMode: input.travelMode,
      defaultMode: input.defaultMode ?? 'DRIVING',
      useRouteApi: input.useRouteApi,
    });

    let eta: TravelEtaEnvelopeV1 = {
      ...hop.eta,
      providerTraceStatus:
        hop.eta.provenance.provider === 'UNKNOWN' ? 'UNKNOWN' : hop.eta.providerTraceStatus ?? 'CONFIRMED',
    };

    const ctx = input.tripContext ?? {};
    const month =
      ctx.month ??
      (input.departureTime
        ? new Date(input.departureTime).getUTCMonth() + 1
        : new Date().getUTCMonth() + 1);

    const policy = resolveTerrainPolicy({
      terrainPolicy: ctx.terrainPolicy,
      includeTerrain: ctx.includeTerrain,
      origin: input.origin,
      destination: input.destination,
      countryCode: ctx.countryCode,
      isFRoad: ctx.isFRoad,
      highlandRisk: ctx.highlandRisk,
      roadId: ctx.roadId,
      activityType: ctx.activityType,
      needsTerrainEvidence: ctx.needsTerrainEvidence,
      needsVehicleFit: ctx.needsVehicleFit ?? !!input.vehicle,
      distanceM: eta.distanceM ?? hop.distanceMeters,
    });

    let demRan = false;
    if (policy.runDem && this.demProfile && eta.geometry?.value && eta.geometry.encoding !== 'NONE') {
      try {
        const terrain = await this.demProfile.profile({
          geometry: eta.geometry,
          sampleIntervalM: 100,
          activityType: /walk|hike/i.test(ctx.activityType ?? '') ? 'walking' : 'driving',
        });
        if (terrain) {
          eta = { ...eta, terrain };
          demRan = true;
        } else if (policy.demRequired) {
          eta = {
            ...eta,
            terrain: {
              ascentM: 0,
              descentM: 0,
              avgSlopePct: 0,
              maxSlopePct: 0,
              sampleCount: 0,
              demSource: 'NONE',
              confidence: 0,
              geometrySource: eta.geometry.source,
            },
          };
        }
      } catch (err) {
        this.logger.debug(`DEM profile failed: ${(err as Error)?.message ?? err}`);
        if (policy.demRequired) {
          eta = {
            ...eta,
            terrain: {
              ascentM: 0,
              descentM: 0,
              avgSlopePct: 0,
              maxSlopePct: 0,
              sampleCount: 0,
              demSource: 'NONE',
              confidence: 0,
              geometrySource: eta.geometry?.source ?? 'NONE',
            },
          };
        }
      }
    } else if (policy.demRequired && !eta.terrain) {
      eta = {
        ...eta,
        terrain: {
          ascentM: 0,
          descentM: 0,
          avgSlopePct: 0,
          maxSlopePct: 0,
          sampleCount: 0,
          demSource: 'NONE',
          confidence: 0,
          geometrySource: eta.geometry?.source ?? 'NONE',
        },
      };
    }

    let authority = resolveTravelEtaAuthorityForTrip({
      tripId: ctx.tripId,
      override: ctx.authority,
      countryCode: ctx.countryCode,
    });

    const providerGuard = applyProviderUnknownAuthorityGuard(
      authority,
      eta.provenance.provider,
      eta.providerTraceStatus,
    );
    if (providerGuard.blockedReason) {
      authority = providerGuard.authority;
      this.logger.debug(
        `Authority downgraded: ${providerGuard.blockedReason} trip=${ctx.tripId ?? '-'}`,
      );
    }

    const l2 = applyIcelandPlanningEtaAdjustment({
      baseEta: eta,
      origin: input.origin,
      destination: input.destination,
      vehicle: input.vehicle,
      roadStatus: ctx.roadStatus,
      roadId: ctx.roadId,
      isFRoad: ctx.isFRoad,
      highlandRisk: ctx.highlandRisk,
      month,
      terrain: eta.terrain,
      authority,
      pavedRingRoad: ctx.pavedRingRoad,
    });

    if (!ctx.skipReconciliation && this.reconciliation) {
      try {
        this.reconciliation.recordPlanningPrediction({
          eta: l2.eta,
          tripId: ctx.tripId,
          fromItemId: ctx.fromItemId,
          toItemId: ctx.toItemId,
          decision: l2.decision,
        });
      } catch (err) {
        this.logger.debug(`reconciliation emit failed: ${(err as Error)?.message ?? err}`);
      }
    }

    return {
      durationMinutes: l2.eta.schedulableDurationMin,
      distanceMeters: hop.distanceMeters,
      travelMode: hop.travelMode,
      source: hop.source,
      eta: l2.eta,
      decision: l2.decision,
      decisionReasons: l2.reasons,
      terrainPolicyMode: policy.mode,
      demRan,
    };
  }
}
