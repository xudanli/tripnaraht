// src/trips/readiness/services/readiness-auto-repair.service.ts

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { CoverageMapService } from './coverage-map.service';
import { RepairOption } from '../types/coverage-map.types';
import {
  ApplyRepairResponse,
  AutoRepairActionResult,
  AutoRepairResponse,
  RefreshEvidenceResult,
} from '../types/readiness-auto-repair.types';
import { DataSourceRouterService } from '../../../data-contracts/services/data-source-router.service';
import { TripsService } from '../../trips.service';
import { EvidenceFetchTaskService } from '../../services/evidence-fetch-task.service';

const AUTO_ELIGIBLE_ACTIONS = [
  'fetch_weather',
  'check_road',
  'check_hours',
  'refresh',
  'manual_confirm',
] as const;

@Injectable()
export class ReadinessAutoRepairService {
  private readonly logger = new Logger(ReadinessAutoRepairService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coverageMapService: CoverageMapService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async autoRepair(
    tripId: string,
    options?: { blockerIds?: string[]; maxActions?: number },
  ): Promise<AutoRepairResponse> {
    const trip = await this.requireTrip(tripId);
    const maxActions = Math.min(Math.max(options?.maxActions ?? 5, 1), 20);

    const scoreBefore = (await this.coverageMapService.getReadinessScore(tripId)).score;
    const refresh = await this.refreshEvidence(tripId);

    const scoreData = await this.coverageMapService.getReadinessScore(tripId);
    let blockers = scoreData.findings.filter(
      (f) => f.type === 'blocker' || f.severity === 'high',
    );
    if (options?.blockerIds?.length) {
      const idSet = new Set(options.blockerIds);
      blockers = blockers.filter((b) => idSet.has(b.id));
    }
    blockers = blockers.slice(0, maxActions);

    const repairs: AutoRepairActionResult[] = [];
    let applied = 0;
    let skipped = 0;
    let failed = 0;

    for (const blocker of blockers) {
      const repairOpts = await this.coverageMapService.getRepairOptions(tripId, blocker.id);
      const option =
        repairOpts.options.find((o) =>
          AUTO_ELIGIBLE_ACTIONS.includes(o.actionType as (typeof AUTO_ELIGIBLE_ACTIONS)[number]),
        ) ?? repairOpts.options[0];

      if (!option) {
        repairs.push({
          blockerId: blocker.id,
          status: 'skipped',
          message: '无可用修复选项',
        });
        skipped++;
        continue;
      }

      const result = await this.applyRepairOption(tripId, trip.destination, blocker.id, option);
      repairs.push(result);
      if (result.status === 'applied') applied++;
      else if (result.status === 'failed') failed++;
      else skipped++;
    }

    const scoreAfter = (await this.coverageMapService.getReadinessScore(tripId)).score;

    return {
      tripId,
      attempted: blockers.length,
      applied,
      skipped,
      failed,
      repairs,
      refresh,
      scoreBefore,
      scoreAfter,
    };
  }

  async applyRepair(
    tripId: string,
    blockerId: string,
    optionId: string,
  ): Promise<ApplyRepairResponse> {
    const trip = await this.requireTrip(tripId);
    const repairOpts = await this.coverageMapService.getRepairOptions(tripId, blockerId);
    const option = repairOpts.options.find((o) => o.id === optionId);
    if (!option) {
      return {
        tripId,
        blockerId,
        optionId,
        status: 'failed',
        message: `修复选项 ${optionId} 不存在`,
      };
    }

    const result = await this.applyRepairOption(tripId, trip.destination, blockerId, option);
    const scoreAfter = (await this.coverageMapService.getReadinessScore(tripId)).score;

    return {
      tripId,
      blockerId,
      optionId,
      actionType: result.actionType,
      status: result.status,
      message: result.message,
      scoreAfter,
    };
  }

  async refreshEvidence(tripId: string): Promise<RefreshEvidenceResult> {
    const trip = await this.requireTrip(tripId);
    const placeIds = await this.collectTripPlaceIds(tripId);

    let weatherApplied = 0;
    let roadApplied = 0;

    if (trip.destination === 'IS' || trip.destination?.startsWith('IS')) {
      weatherApplied = await this.applyRegionalWeatherToPlaces(placeIds);
      roadApplied = await this.applyRegionalRoadStatusToPlaces(placeIds);
    }

    const evidenceSuggestions = await this.queueEvidenceFetchSuggestions(tripId, placeIds.length);

    return {
      tripId,
      placesUpdated: weatherApplied + roadApplied,
      weatherApplied,
      roadApplied,
      evidenceSuggestions,
    };
  }

  private async applyRepairOption(
    tripId: string,
    destination: string,
    blockerId: string,
    option: RepairOption,
  ): Promise<AutoRepairActionResult> {
    const actionType = option.actionType ?? 'unknown';
    try {
      switch (actionType) {
        case 'fetch_weather': {
          const placeIds = await this.collectTripPlaceIds(tripId);
          const n =
            destination === 'IS' || destination?.startsWith('IS')
              ? await this.applyRegionalWeatherToPlaces(placeIds)
              : 0;
          return {
            blockerId,
            optionId: option.id,
            actionType,
            status: n > 0 ? 'applied' : 'skipped',
            message:
              n > 0
                ? `已为 ${n} 个 POI 写入天气证据`
                : '当前目的地暂不支持自动拉取天气',
          };
        }
        case 'check_road': {
          const placeIds = await this.collectTripPlaceIds(tripId);
          const n =
            destination === 'IS' || destination?.startsWith('IS')
              ? await this.applyRegionalRoadStatusToPlaces(placeIds)
              : 0;
          return {
            blockerId,
            optionId: option.id,
            actionType,
            status: n > 0 ? 'applied' : 'skipped',
            message:
              n > 0
                ? `已为 ${n} 个 POI 写入路况证据`
                : '当前目的地暂不支持自动拉取路况',
          };
        }
        case 'check_hours':
          return {
            blockerId,
            optionId: option.id,
            actionType,
            status: 'skipped',
            message: '营业时间需人工确认或对接 POI 数据源',
          };
        case 'refresh':
          return {
            blockerId,
            optionId: option.id,
            actionType,
            status: 'applied',
            message: '已刷新准备度评分',
          };
        case 'manual_confirm':
          await this.acknowledgeBlocker(tripId, blockerId);
          return {
            blockerId,
            optionId: option.id,
            actionType,
            status: 'applied',
            message: '已记录人工确认',
          };
        default:
          return {
            blockerId,
            optionId: option.id,
            actionType,
            status: 'skipped',
            message: `暂不支持自动执行: ${actionType}`,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`applyRepairOption failed blocker=${blockerId}: ${message}`);
      return {
        blockerId,
        optionId: option.id,
        actionType,
        status: 'failed',
        message,
      };
    }
  }

  private async acknowledgeBlocker(tripId: string, blockerId: string): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);

    const metadata = (trip.metadata as Record<string, unknown>) || {};
    const ack =
      (metadata.readinessAutoRepairAck as Record<string, string>) || {};
    ack[blockerId] = new Date().toISOString();

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: {
          ...metadata,
          readinessAutoRepairAck: ack,
        } as object,
      },
    });
  }

  private async applyRegionalWeatherToPlaces(placeIds: number[]): Promise<number> {
    const router = this.getDataSourceRouter();
    if (!router || placeIds.length === 0) return 0;

    let weatherData: Awaited<ReturnType<DataSourceRouterService['getWeather']>>;
    try {
      weatherData = await router.getWeather({
        lat: 64.5,
        lng: -18.5,
        includeWindDetails: true,
      });
    } catch (err) {
      this.logger.warn(
        `Weather fetch failed: ${err instanceof Error ? err.message : err}`,
      );
      return 0;
    }

    const now = new Date().toISOString();
    let updated = 0;

    for (const placeId of placeIds) {
      const place = await this.prisma.place.findUnique({ where: { id: placeId } });
      if (!place) continue;

      const meta = (place.metadata as Record<string, unknown>) || {};
      if (meta.weatherInfo || meta.weather) continue;

      await this.prisma.place.update({
        where: { id: placeId },
        data: {
          metadata: {
            ...meta,
            weatherInfo: {
              temperature: weatherData.temperature,
              windSpeed: weatherData.windSpeed,
              windDirection: weatherData.windDirection,
              condition: weatherData.condition,
              visibility: weatherData.visibility,
              lastUpdated: weatherData.lastUpdated?.toISOString?.() ?? now,
              source: weatherData.source ?? 'readiness-auto-repair',
            },
            weatherFetchedAt: now,
          } as object,
        },
      });
      updated++;
    }

    return updated;
  }

  private async applyRegionalRoadStatusToPlaces(placeIds: number[]): Promise<number> {
    const router = this.getDataSourceRouter();
    if (!router || placeIds.length === 0) return 0;

    let roadStatus: Awaited<ReturnType<DataSourceRouterService['getRoadStatus']>>;
    try {
      roadStatus = await router.getRoadStatus({ lat: 64.5, lng: -18.5 });
    } catch (err) {
      this.logger.warn(
        `Road status fetch failed: ${err instanceof Error ? err.message : err}`,
      );
      return 0;
    }

    const now = new Date().toISOString();
    let updated = 0;

    for (const placeId of placeIds) {
      const place = await this.prisma.place.findUnique({ where: { id: placeId } });
      if (!place) continue;

      const meta = (place.metadata as Record<string, unknown>) || {};
      if (meta.roadStatus || meta.roadClosure) continue;

      const roadPayload = {
        isOpen: roadStatus.isOpen,
        riskLevel: roadStatus.riskLevel,
        reason: roadStatus.reason,
        lastUpdated: roadStatus.lastUpdated?.toISOString?.() ?? now,
        source: roadStatus.source ?? 'readiness-auto-repair',
      };

      await this.prisma.place.update({
        where: { id: placeId },
        data: {
          metadata: {
            ...meta,
            roadStatus: roadPayload,
            roadClosure: roadPayload,
            roadStatusFetchedAt: now,
          } as object,
        },
      });
      updated++;
    }

    return updated;
  }

  private async queueEvidenceFetchSuggestions(
    tripId: string,
    totalPlaces: number,
  ): Promise<RefreshEvidenceResult['evidenceSuggestions']> {
    const tripsService = this.getTripsService();
    if (!tripsService) return undefined;

    try {
      const suggestions = await tripsService.getEvidenceFetchSuggestions(tripId);
      let taskId: string | undefined;
      const taskService = this.getEvidenceFetchTaskService();
      if (taskService && suggestions.hasMissingEvidence && totalPlaces > 0) {
        taskId = taskService.createTask(tripId, totalPlaces);
      }

      return {
        hasMissingEvidence: suggestions.hasMissingEvidence,
        completenessScore: suggestions.completenessScore,
        suggestionsCount: suggestions.suggestions.length,
        taskId,
      };
    } catch (err) {
      this.logger.warn(
        `Evidence suggestions unavailable: ${err instanceof Error ? err.message : err}`,
      );
      return undefined;
    }
  }

  private async collectTripPlaceIds(tripId: string): Promise<number[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: { ItineraryItem: { select: { placeId: true } } },
        },
      },
    });
    if (!trip) return [];

    const ids = new Set<number>();
    for (const day of trip.TripDay) {
      for (const item of day.ItineraryItem) {
        if (item.placeId) ids.add(item.placeId);
      }
    }
    return [...ids];
  }

  private async requireTrip(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }
    return trip;
  }

  private getDataSourceRouter(): DataSourceRouterService | null {
    try {
      return this.moduleRef.get(DataSourceRouterService, { strict: false });
    } catch {
      return null;
    }
  }

  private getTripsService(): TripsService | null {
    try {
      return this.moduleRef.get(TripsService, { strict: false });
    } catch {
      return null;
    }
  }

  private getEvidenceFetchTaskService(): EvidenceFetchTaskService | null {
    try {
      return this.moduleRef.get(EvidenceFetchTaskService, { strict: false });
    } catch {
      return null;
    }
  }
}
