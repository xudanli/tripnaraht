/**
 * PR-A — Evidence Resolver: normalize road observations → WorldStateAssertion + snapshot.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { RoadStatus } from '../../../skills/world/services/road-status-realtime.service';
import { RoadStatusRealtimeService } from '../../../skills/world/services/road-status-realtime.service';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { WorldStateSnapshot } from '../contracts/world-state.types';
import { RFC001_EVIDENCE_RESOLVER_VERSION } from '../config/rfc001-iceland.config';
import {
  assertionImpliesHardClosure,
  roadStatusChangedToAssertion,
  roadStatusSnapshotToAssertion,
  buildEvidenceRefForRoad,
  type RoadStatusAssertionPayload,
} from '../adapters/road-status-to-assertion.adapter';
import {
  buildRoadStatusChangedEvent,
  mapRealtimeStatusToChangedStatus,
  type RoadStatusChangedEvent,
  type RoadStatusChangedStatus,
} from './road-status-changed.event';
import {
  buildWeatherHazardChangedEvent,
  weatherHazardImpliesProhibition,
  type WeatherHazardChangedEvent,
  type WeatherHazardSourceProvider,
} from './weather-hazard-changed.event';
import {
  assertionImpliesWeatherProhibition,
  buildEvidenceRefForWeather,
  weatherHazardChangedToAssertion,
  type WeatherHazardAssertionPayload,
} from '../adapters/weather-hazard-to-assertion.adapter';
import {
  assertionImpliesExcessiveDailyLoad,
  buildEvidenceRefForDailyLoad,
  dailyLoadChangedToAssertion,
  type DailyLoadAssertionPayload,
} from '../adapters/daily-load-to-assertion.adapter';
import type { DailyLoadChangedEvent } from './daily-load-changed.event';
import { WeatherLiveEvidenceService } from './weather-live-evidence.service';
import { WorldStateStoreService } from './world-state-store.service';

export interface ResolveRoadStatusChangedResult {
  event: RoadStatusChangedEvent;
  assertion: WorldStateAssertion<RoadStatusAssertionPayload>;
  snapshot: WorldStateSnapshot;
  resolverVersion: string;
  hardClosure: boolean;
  supersededAssertionIds: string[];
}

export interface ResolveWeatherHazardChangedResult {
  event: WeatherHazardChangedEvent;
  assertion: WorldStateAssertion<WeatherHazardAssertionPayload>;
  snapshot: WorldStateSnapshot;
  resolverVersion: string;
  weatherProhibition: boolean;
  supersededAssertionIds: string[];
}

export interface ResolveDailyLoadChangedResult {
  event: DailyLoadChangedEvent;
  assertion: WorldStateAssertion<DailyLoadAssertionPayload>;
  snapshot: WorldStateSnapshot;
  resolverVersion: string;
  excessiveLoad: boolean;
  supersededAssertionIds: string[];
}

export interface FetchRoadStatusChangeInput {
  tripId: string;
  roadId: string;
  segmentId?: string;
  correlationId?: string;
}

@Injectable()
export class EvidenceResolverService {
  private readonly logger = new Logger(EvidenceResolverService.name);

  constructor(
    private readonly worldStateStore: WorldStateStoreService,
    @Optional() private readonly roadStatusRealtime?: RoadStatusRealtimeService,
    @Optional() private readonly weatherLive?: WeatherLiveEvidenceService,
  ) {}

  /**
   * Resolve a ROAD_STATUS_CHANGED event into a persisted WorldStateAssertion.
   */
  async resolveRoadStatusChanged(
    event: RoadStatusChangedEvent,
  ): Promise<ResolveRoadStatusChangedResult> {
    const tripId = event.aggregateId;
    const { roadId, status, segmentId, previousStatus, sourceProvider } =
      event.payload;

    const observedAt = event.occurredAt;
    const evidenceRef =
      event.payload.evidenceRef ??
      buildEvidenceRefForRoad(tripId, roadId, observedAt);

    const assertion = roadStatusChangedToAssertion({
      tripId,
      roadId,
      segmentId,
      status,
      previousStatus,
      evidenceRef,
      sourceProvider,
      observedAt,
      confidence: status === 'UNKNOWN' ? 0.4 : 0.9,
    });

    await this.worldStateStore.appendRoadStatusEvent(tripId, {
      ...event,
      payload: { ...event.payload, evidenceRef },
    });

    const { snapshot, supersededAssertionIds } =
      await this.worldStateStore.appendAssertion(tripId, assertion);

    const hardClosure = assertionImpliesHardClosure(assertion);

    this.logger.debug(
      `resolveRoadStatusChanged trip=${tripId} road=${roadId} status=${status} snapshot=${snapshot.snapshotId} hardClosure=${hardClosure}`,
    );

    return {
      event: { ...event, payload: { ...event.payload, evidenceRef } },
      assertion,
      snapshot,
      resolverVersion: RFC001_EVIDENCE_RESOLVER_VERSION,
      hardClosure,
      supersededAssertionIds,
    };
  }

  /**
   * Fetch live road status; emit event only when status changed vs last ACTIVE assertion.
   */
  async fetchAndResolveIfChanged(
    input: FetchRoadStatusChangeInput,
  ): Promise<ResolveRoadStatusChangedResult | null> {
    if (!this.roadStatusRealtime) {
      throw new Error(
        'RoadStatusRealtimeService unavailable; inject SkillsModule or pass a RoadStatusChangedEvent to resolveRoadStatusChanged',
      );
    }

    const roadId = input.roadId.toUpperCase();
    const rs = await this.roadStatusRealtime.getRoadStatus(roadId);
    if (!rs) {
      this.logger.warn(`fetchAndResolveIfChanged: no status for ${roadId}`);
      return null;
    }

    const nextStatus = mapRealtimeStatusToChangedStatus(rs.currentStatus);
    const previous = await this.worldStateStore.getActiveAssertionForRoad(
      input.tripId,
      roadId,
    );
    const previousStatus = previous
      ? (previous.payload as RoadStatusAssertionPayload).status
      : undefined;

    if (previousStatus === nextStatus) {
      this.logger.debug(
        `fetchAndResolveIfChanged: no change trip=${input.tripId} road=${roadId} status=${nextStatus}`,
      );
      return null;
    }

    const event = buildRoadStatusChangedEvent({
      tripId: input.tripId,
      roadId,
      segmentId: input.segmentId,
      status: nextStatus,
      previousStatus,
      sourceProvider: rs.seasonalFallback
        ? 'static_seasonal_data'
        : rs.dataSource?.includes('cache')
          ? 'road.is_api_or_cache'
          : 'road.is_api',
      correlationId: input.correlationId,
    });

    return this.resolveRoadStatusChanged(event);
  }

  /**
   * Resolve from an already-fetched RoadStatus (tests / FRoadCheck shadow hook).
   */
  async resolveFromRoadStatusSnapshot(
    tripId: string,
    rs: RoadStatus,
    opts?: { segmentId?: string; forceEvent?: boolean },
  ): Promise<ResolveRoadStatusChangedResult> {
    const event = buildRoadStatusChangedEvent({
      tripId,
      roadId: rs.roadId,
      segmentId: opts?.segmentId,
      status: mapRealtimeStatusToChangedStatus(rs.currentStatus),
      sourceProvider: rs.seasonalFallback
        ? 'static_seasonal_data'
        : 'road.is_api',
    });

    const assertion = roadStatusSnapshotToAssertion(tripId, rs, {
      segmentId: opts?.segmentId,
      event,
    });

    if (!opts?.forceEvent) {
      const previous = await this.worldStateStore.getActiveAssertionForRoad(
        tripId,
        rs.roadId,
      );
      const prevStatus = previous
        ? (previous.payload as RoadStatusAssertionPayload).status
        : undefined;
      if (prevStatus === assertion.payload.status) {
        const snapshot =
          (await this.worldStateStore.readStore(tripId)).snapshots.at(-1) ??
          ({
            snapshotId: `wss_${tripId}_noop`,
            revision: '0',
            capturedAt: new Date().toISOString(),
            assertionIds: previous ? [previous.assertionId] : [],
          } as WorldStateSnapshot);
        const chosen = (previous ?? assertion) as WorldStateAssertion<RoadStatusAssertionPayload>;
        return {
          event,
          assertion: chosen,
          snapshot,
          resolverVersion: RFC001_EVIDENCE_RESOLVER_VERSION,
          hardClosure: assertionImpliesHardClosure(chosen),
          supersededAssertionIds: [],
        };
      }
    }

    return this.resolveRoadStatusChanged({
      ...event,
      payload: {
        ...event.payload,
        evidenceRef: assertion.source.evidenceRefs[0],
      },
    });
  }

  /**
   * Resolve WEATHER_HAZARD_CHANGED → WorldStateAssertion + snapshot.
   */
  async resolveWeatherHazardChanged(
    event: WeatherHazardChangedEvent,
  ): Promise<ResolveWeatherHazardChangedResult> {
    const tripId = event.aggregateId;
    const observedAt = event.occurredAt;
    const regionId = event.payload.regionId ?? 'IS_DEFAULT';
    const evidenceRef =
      event.payload.evidenceRef ??
      buildEvidenceRefForWeather(tripId, regionId, observedAt);

    const assertion = weatherHazardChangedToAssertion({
      tripId,
      payload: { ...event.payload, regionId },
      evidenceRef,
      observedAt,
      confidence: weatherHazardImpliesProhibition(event.payload) ? 0.92 : 0.85,
    });

    await this.worldStateStore.appendTravelDecisionEvent(tripId, {
      ...event,
      payload: { ...event.payload, evidenceRef, regionId },
    });

    const { snapshot, supersededAssertionIds } =
      await this.worldStateStore.appendAssertion(tripId, assertion);

    const weatherProhibition = assertionImpliesWeatherProhibition(assertion);

    this.logger.debug(
      `resolveWeatherHazardChanged trip=${tripId} region=${regionId} wind=${event.payload.windSpeedKmh} snapshot=${snapshot.snapshotId}`,
    );

    return {
      event: { ...event, payload: { ...event.payload, evidenceRef, regionId } },
      assertion,
      snapshot,
      resolverVersion: RFC001_EVIDENCE_RESOLVER_VERSION,
      weatherProhibition,
      supersededAssertionIds,
    };
  }

  /**
   * Poll live weather for a trip day; emit event when wind speed changes vs last ACTIVE assertion.
   */
  async fetchAndResolveWeatherIfChanged(input: {
    tripId: string;
    dayIndex: number;
  }): Promise<ResolveWeatherHazardChangedResult | null> {
    if (!this.weatherLive) {
      throw new Error(
        'WeatherLiveEvidenceService unavailable; inject DataContractsModule or pass a WeatherHazardChangedEvent to resolveWeatherHazardChanged',
      );
    }

    const observation = await this.weatherLive.fetchWindForTripDay(
      input.tripId,
      input.dayIndex,
    );
    if (!observation) {
      return null;
    }

    const previous = await this.worldStateStore.getActiveWeatherAssertionForDay(
      input.tripId,
      input.dayIndex,
      observation.regionId,
    );
    const prevWind = previous
      ? (previous.payload as WeatherHazardAssertionPayload).windSpeedKmh
      : undefined;

    if (prevWind === observation.windSpeedKmh) {
      this.logger.debug(
        `fetchAndResolveWeatherIfChanged: no change trip=${input.tripId} day=${input.dayIndex} wind=${observation.windSpeedKmh}`,
      );
      return null;
    }

    const event = buildWeatherHazardChangedEvent({
      tripId: input.tripId,
      dayIndex: observation.dayIndex,
      regionId: observation.regionId,
      windSpeedKmh: observation.windSpeedKmh,
      windGustKmh: observation.windGustKmh,
      sourceProvider: observation.sourceProvider,
    });

    return this.resolveWeatherHazardChanged(event);
  }

  /**
   * Resolve DAILY_LOAD_EXCEEDED → WorldStateAssertion + snapshot.
   */
  async resolveDailyLoadChanged(
    event: DailyLoadChangedEvent,
  ): Promise<ResolveDailyLoadChangedResult> {
    const tripId = event.aggregateId;
    const observedAt = event.occurredAt;
    const dayIndex = event.payload.dayIndex;
    const evidenceRef =
      event.payload.evidenceRef ??
      buildEvidenceRefForDailyLoad(tripId, dayIndex, observedAt);

    const assertion = dailyLoadChangedToAssertion({
      tripId,
      payload: event.payload,
      evidenceRef,
      observedAt,
    });

    await this.worldStateStore.appendTravelDecisionEvent(tripId, {
      ...event,
      payload: { ...event.payload, evidenceRef },
    });

    const { snapshot, supersededAssertionIds } =
      await this.worldStateStore.appendAssertion(tripId, assertion);

    const excessiveLoad = assertionImpliesExcessiveDailyLoad(assertion);

    this.logger.debug(
      `resolveDailyLoadChanged trip=${tripId} day=${dayIndex} hours=${event.payload.drivingHours} snapshot=${snapshot.snapshotId}`,
    );

    return {
      event: { ...event, payload: { ...event.payload, evidenceRef } },
      assertion,
      snapshot,
      resolverVersion: RFC001_EVIDENCE_RESOLVER_VERSION,
      excessiveLoad,
      supersededAssertionIds,
    };
  }
}
