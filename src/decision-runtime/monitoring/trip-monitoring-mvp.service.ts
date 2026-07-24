/**
 * Trip Monitoring MVP — scan 5 variable classes, persist state, dispatch Gateway polls.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorldStateStoreService } from '../../trips/guardian-decision-core/evidence/world-state-store.service';
import { DecisionTriggerGatewayService } from '../trigger/decision-trigger.gateway.service';
import { isDecisionTriggerGatewayEnabled } from '../trigger/decision-trigger.config';
import { SnapshotTriggerEnrichmentService } from '../snapshot/snapshot-trigger-enrichment.service';
import { attachContextSnapshotToTriggerInput } from '../trigger/intent/attach-context-snapshot.util';
import { TripContextSnapshotAssemblerService } from '../snapshot/trip-context-snapshot.assembler.service';
import { RoadSegmentUnavailableRunnerService } from '../../trips/guardian-decision-core/execution/road-segment-unavailable-runner.service';
import { WeatherActivityProhibitedRunnerService } from '../../trips/guardian-decision-core/execution/weather-activity-prohibited-runner.service';
import { Rfc001DecisionProblemStoreService } from '../../trips/guardian-decision-core/persistence/rfc001-decision-problem.store';
import {
  findLatestRoadStatusEvent,
  findRoadStatusEventForProcessing,
  findOpenRoadProblemId,
  findRoadProblemIdForEvent,
  findExistingRoadProblemId,
  roadIdFromAssertion,
} from './utils/find-road-status-event.util';
import {
  dayIndexFromWeatherAssertion,
  findLatestWeatherHazardEvent,
  findOpenProblemIdForEvent,
  findProblemIdForTriggerEvent,
  findExistingWeatherProblemId,
  weatherAssertionImpliesHazard,
} from './utils/find-weather-hazard-event.util';
import type {
  StoredTripMonitoringMvpState,
  TripMonitoringItemView,
  TripMonitoringMvpKind,
  TripMonitoringScanResult,
} from './trip-monitoring-mvp.types';
import {
  MONITORING_MVP_METADATA_KEY,
  TRIP_MONITORING_SCAN_SCHEMA_ID,
} from './trip-monitoring-mvp.types';
import { AssertionPromotionService } from './assertion-promotion/assertion-promotion.service';

const MVP_KINDS: TripMonitoringMvpKind[] = [
  'ROAD_CLOSURE',
  'WEATHER_HAZARD',
  'FLIGHT_STATUS',
  'POI_CLOSURE',
  'BOOKING_STATUS',
];

const KIND_LABELS: Record<TripMonitoringMvpKind, string> = {
  ROAD_CLOSURE: '道路封闭',
  WEATHER_HAZARD: '严重天气',
  FLIGHT_STATUS: '航班状态',
  POI_CLOSURE: 'POI 临时关闭',
  BOOKING_STATUS: '预约状态',
};

@Injectable()
export class TripMonitoringMvpService {
  private readonly logger = new Logger(TripMonitoringMvpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly worldStore: WorldStateStoreService,
    private readonly snapshotAssembler: TripContextSnapshotAssemblerService,
    @Optional() private readonly triggerGateway?: DecisionTriggerGatewayService,
    @Optional() private readonly snapshotEnrichment?: SnapshotTriggerEnrichmentService,
    @Optional() private readonly roadRunner?: RoadSegmentUnavailableRunnerService,
    @Optional() private readonly weatherRunner?: WeatherActivityProhibitedRunnerService,
    @Optional() private readonly problemStore?: Rfc001DecisionProblemStoreService,
    @Optional() private readonly assertionPromotion?: AssertionPromotionService,
  ) {}

  async listItems(tripId: string): Promise<TripMonitoringItemView[]> {
    const stored = await this.readState(tripId);
    if (stored.items.length > 0) {
      return stored.items;
    }
    return MVP_KINDS.map((kind) => defaultPendingItem(kind));
  }

  async scanTrip(tripId: string, opts?: { dayIndex?: number }): Promise<TripMonitoringScanResult> {
    const scannedAt = new Date().toISOString();
    const snapshotRef = await this.snapshotAssembler.resolveSnapshotRef(tripId);
    const gatewayEnabled = isDecisionTriggerGatewayEnabled();
    const items: TripMonitoringItemView[] = [];
    const dispatches: TripMonitoringScanResult['dispatches'] = [];
    const dayIndex = opts?.dayIndex ?? 0;

    // 1) Road closures — detect + run canonical road-close pipeline when wired
    const roadScan = await this.scanAndProcessRoadClosures(tripId, scannedAt);
    items.push(...roadScan.items);
    dispatches.push(...roadScan.dispatches);

    // 2) Weather hazard — Gateway poll when enabled, else direct runner from world assertions
    if (gatewayEnabled && this.triggerGateway?.isEnabled()) {
      const weather = await this.dispatchMonitoringPoll(tripId, dayIndex, snapshotRef);
      dispatches.push(weather.dispatch);
      if (weather.item) items.push(weather.item);
    } else {
      const weatherScan = await this.scanAndProcessWeatherHazards(tripId, scannedAt, dayIndex);
      items.push(...weatherScan.items);
      dispatches.push(...weatherScan.dispatches);
      if (weatherScan.items.length === 0) {
        items.push(defaultPendingItem('WEATHER_HAZARD', scannedAt));
        dispatches.push({
          kind: 'WEATHER_HAZARD',
          status: 'SKIPPED',
          detail: 'no_weather_hazard_assertion',
        });
      }
    }

    for (const kind of ['FLIGHT_STATUS', 'POI_CLOSURE', 'BOOKING_STATUS'] as const) {
      if (!items.some((i) => i.kind === kind)) {
        items.push(defaultPendingItem(kind, scannedAt));
      }
    }

    const activeAlertCount = items.filter((i) => i.status === 'ALERT').length;

    await this.persistState(tripId, { lastScanAt: scannedAt, items });

    if (this.assertionPromotion?.isEnabled()) {
      try {
        await this.assertionPromotion.reconcileTripAssertions(tripId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[MonitoringMVP] assertion promotion reconcile failed trip=${tripId}: ${message}`,
        );
      }
    }

    return {
      schemaId: TRIP_MONITORING_SCAN_SCHEMA_ID,
      tripId,
      scannedAt,
      contextSnapshotId: snapshotRef.snapshotId,
      contextSnapshotRevision: snapshotRef.revision,
      activeAlertCount,
      items,
      gatewayEnabled,
      dispatches,
    };
  }

  private async scanAndProcessRoadClosures(
    tripId: string,
    scannedAt: string,
  ): Promise<{
    items: TripMonitoringItemView[];
    dispatches: TripMonitoringScanResult['dispatches'];
  }> {
    const store = await this.worldStore.readStore(tripId);
    const closed = store.assertions.filter((a) => {
      if (a.status !== 'ACTIVE' || a.predicate !== 'road.status') return false;
      const payload = a.payload as { status?: string };
      return payload.status === 'CLOSED' || payload.status === 'RESTRICTED' || payload.status === 'LIMITED';
    });

    if (closed.length === 0) {
      return { items: [], dispatches: [] };
    }

    const openProblems = this.problemStore ? await this.problemStore.list(tripId) : [];
    const items: TripMonitoringItemView[] = [];
    const dispatches: TripMonitoringScanResult['dispatches'] = [];

    for (const assertion of closed) {
      const payload = assertion.payload as { roadId?: string; status?: string; segmentId?: string };
      const roadId = roadIdFromAssertion(assertion) ?? payload.roadId ?? 'unknown';
      const problems = this.problemStore ? await this.problemStore.list(tripId) : openProblems;
      const event = findRoadStatusEventForProcessing(store, tripId, roadId, problems);
      const existingRoadProblemId = findExistingRoadProblemId(problems, roadId);
      const knownProblemId = event
        ? findRoadProblemIdForEvent(problems, event.eventId)
        : existingRoadProblemId;
      let problemId = knownProblemId ?? existingRoadProblemId;
      let dispatchStatus: TripMonitoringScanResult['dispatches'][0]['status'] = 'SKIPPED';
      let dispatchDetail: string | undefined;

      if (problemId) {
        dispatchStatus = 'COMPLETED';
        dispatchDetail =
          event && findOpenRoadProblemId(problems, event.eventId)
            ? 'existing_open_problem'
            : 'existing_problem';
      } else if (event && this.roadRunner) {
        try {
          const run = await this.roadRunner.runFullFromEvent(event);
          problemId = run.problem?.problemId ?? problemId;
          dispatchStatus = run.problem ? 'COMPLETED' : 'SKIPPED';
          dispatchDetail = run.problem
            ? run.problem.problemId
            : 'no_plan_item_impact';
        } catch (err: unknown) {
          dispatchStatus = 'FAILED';
          dispatchDetail = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[MonitoringMVP] road closure dispatch failed trip=${tripId} road=${roadId}: ${dispatchDetail}`,
          );
        }
      } else if (!event) {
        dispatchDetail = 'missing_road_status_event';
      } else if (!this.roadRunner) {
        dispatchDetail = 'road_runner_not_wired';
      }

      dispatches.push({
        kind: 'ROAD_CLOSURE',
        status: dispatchStatus,
        detail: dispatchDetail,
      });

      const statusLabel =
        payload.status === 'RESTRICTED' || payload.status === 'LIMITED' ? '受限' : '封闭';

      items.push({
        kind: 'ROAD_CLOSURE',
        label: KIND_LABELS.ROAD_CLOSURE,
        status: 'ALERT',
        lastCheckedAt: scannedAt,
        summary: `${roadId} ${statusLabel}，可能影响相关驾驶段`,
        evidenceSource: assertion.source?.provider ?? 'road.status',
        problemId,
      });
    }

    return { items, dispatches };
  }

  private async scanAndProcessWeatherHazards(
    tripId: string,
    scannedAt: string,
    dayIndex: number,
  ): Promise<{
    items: TripMonitoringItemView[];
    dispatches: TripMonitoringScanResult['dispatches'];
  }> {
    const store = await this.worldStore.readStore(tripId);
    const hazardous = store.assertions.filter(weatherAssertionImpliesHazard);

    const relevant =
      hazardous.length > 0
        ? hazardous.filter((a) => {
            const idx = dayIndexFromWeatherAssertion(a);
            return idx == null || idx === dayIndex;
          })
        : [];

    if (relevant.length === 0) {
      return { items: [], dispatches: [] };
    }

    const problems = this.problemStore ? await this.problemStore.list(tripId) : [];
    const items: TripMonitoringItemView[] = [];
    const dispatches: TripMonitoringScanResult['dispatches'] = [];

    for (const assertion of relevant) {
      const idx = dayIndexFromWeatherAssertion(assertion) ?? dayIndex;
      const event = findLatestWeatherHazardEvent(store, tripId, idx);
      const existingWeatherProblemId = findExistingWeatherProblemId(problems, idx);
      const knownProblemId = event
        ? findProblemIdForTriggerEvent(problems, event.eventId)
        : existingWeatherProblemId;
      let problemId = knownProblemId ?? existingWeatherProblemId;
      let dispatchStatus: TripMonitoringScanResult['dispatches'][0]['status'] = 'SKIPPED';
      let dispatchDetail: string | undefined;

      if (problemId) {
        dispatchStatus = 'COMPLETED';
        dispatchDetail =
          event && findOpenProblemIdForEvent(problems, event.eventId)
            ? 'existing_open_problem'
            : 'existing_problem';
      } else if (event && this.weatherRunner) {
        try {
          const run = await this.weatherRunner.runFullFromEvent(event);
          problemId = run.problem?.problemId ?? problemId;
          dispatchStatus = run.problem ? 'COMPLETED' : 'SKIPPED';
          dispatchDetail = run.problem ? run.problem.problemId : 'no_plan_item_impact';
        } catch (err: unknown) {
          dispatchStatus = 'FAILED';
          dispatchDetail = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[MonitoringMVP] weather dispatch failed trip=${tripId} day=${idx}: ${dispatchDetail}`,
          );
        }
      } else if (!event) {
        dispatchDetail = 'missing_weather_hazard_event';
      } else if (!this.weatherRunner) {
        dispatchDetail = 'weather_runner_not_wired';
      }

      dispatches.push({
        kind: 'WEATHER_HAZARD',
        status: dispatchStatus,
        detail: dispatchDetail,
      });

      const payload = assertion.payload as { windSpeedKmh?: number; windGustKmh?: number };
      const wind = Math.max(payload.windSpeedKmh ?? 0, payload.windGustKmh ?? 0);

      items.push({
        kind: 'WEATHER_HAZARD',
        label: KIND_LABELS.WEATHER_HAZARD,
        status: 'ALERT',
        lastCheckedAt: scannedAt,
        summary: `第 ${idx + 1} 天强风（${wind} km/h），户外活动可能受限`,
        evidenceSource: assertion.source?.provider ?? 'weather.hazard',
        affectedDayIndex: idx,
        problemId,
      });
    }

    return { items, dispatches };
  }

  private async dispatchMonitoringPoll(
    tripId: string,
    dayIndex: number,
    snapshotRef: Awaited<ReturnType<TripContextSnapshotAssemblerService['resolveSnapshotRef']>>,
  ): Promise<{
    dispatch: TripMonitoringScanResult['dispatches'][0];
    item?: TripMonitoringItemView;
  }> {
    const itemKind: TripMonitoringMvpKind = 'WEATHER_HAZARD';
    try {
      let input = attachContextSnapshotToTriggerInput(
        {
          kind: 'CANONICAL_MONITORING_POLL',
          tripId,
          source: 'INTERNAL',
          monitoring: {
            pollKind: 'WEATHER_HAZARD',
            dayIndex,
            runFull: true,
          },
          metadata: {
            entryPointId: 'monitoring.mvp.scan',
            monitoringMvp: true,
          },
        },
        snapshotRef,
      );

      if (this.snapshotEnrichment) {
        input = await this.snapshotEnrichment.enrichIfMissing(input);
      }

      const result = await this.triggerGateway!.dispatch(input);
      const changed =
        result.result &&
        typeof result.result === 'object' &&
        (result.result as { changed?: boolean }).changed === true;

      const overloaded =
        result.result &&
        typeof result.result === 'object' &&
        (result.result as { overloaded?: boolean }).overloaded === true;

      const hasProblem =
        result.result &&
        typeof result.result === 'object' &&
        Boolean((result.result as { problem?: unknown }).problem);

      const alert = changed || overloaded || hasProblem;

      return {
        dispatch: {
          kind: itemKind,
          status: result.status === 'FAILED' ? 'FAILED' : 'COMPLETED',
          detail: result.status === 'FAILED' ? result.error?.message : undefined,
        },
        item: {
          kind: itemKind,
          label: KIND_LABELS[itemKind],
          status: alert ? 'ALERT' : 'ACTIVE',
          lastCheckedAt: new Date().toISOString(),
          summary: alert
            ? `第 ${dayIndex + 1} 天天气风险需关注，请查看决策队列`
            : '最近一次天气扫描正常',
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[MonitoringMVP] ${itemKind} dispatch failed: ${message}`);
      return {
        dispatch: { kind: itemKind, status: 'FAILED', detail: message },
        item: defaultPendingItem(itemKind),
      };
    }
  }

  private async readState(tripId: string): Promise<StoredTripMonitoringMvpState> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const raw = meta[MONITORING_MVP_METADATA_KEY] as StoredTripMonitoringMvpState | undefined;
    return { items: raw?.items ?? [], lastScanAt: raw?.lastScanAt };
  }

  private async persistState(tripId: string, state: StoredTripMonitoringMvpState): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = { ...((trip?.metadata ?? {}) as Record<string, unknown>) };
    meta[MONITORING_MVP_METADATA_KEY] = state;
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: meta as object },
    });
  }
}

function defaultPendingItem(kind: TripMonitoringMvpKind, lastCheckedAt?: string): TripMonitoringItemView {
  return {
    kind,
    label: KIND_LABELS[kind],
    status: 'PENDING',
    lastCheckedAt,
    summary: '尚未扫描或等待下一次复核',
  };
}
