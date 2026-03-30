// src/trips/decision/services/plan-converter.service.ts
/**
 * Plan Converter Service
 * 
 * 在 TripPlan 和 RoutePlanDraft 之间转换
 */

import { Injectable } from '@nestjs/common';
import { TripPlan } from '../plan-model';
import { RoutePlanDraft, RouteSegment } from '../shared/world-model.types';
import { TripWorldState } from '../world-model';

@Injectable()
export class PlanConverterService {
  /**
   * 将 TripPlan 转换为 RoutePlanDraft
   */
  convertTripPlanToRoutePlanDraft(
    plan: TripPlan,
    tripId: string,
    routeDirectionId: string
  ): RoutePlanDraft {
    const segments: RouteSegment[] = [];

    for (const day of plan.days) {
      // 从 terrainFacts 提取信息
      const terrainFacts = day.terrainFacts;
      const totalAscentM = terrainFacts?.totalAscent || 0;
      const maxElevation = terrainFacts?.maxElevation || 0;
      const minElevation = terrainFacts?.minElevation || 0;

      // 估算距离（简化：基于时间槽数量）
      const estimatedDistanceKm = day.timeSlots.length * 10; // 简化估算

      // 估算坡度（基于爬升和距离）
      const estimatedSlopePct = estimatedDistanceKm > 0
        ? (totalAscentM / (estimatedDistanceKm * 1000)) * 100
        : 0;

      // 从第一个和最后一个 slot 提取 POI 信息
      const firstSlot = day.timeSlots[0];
      const lastSlot = day.timeSlots[day.timeSlots.length - 1];

      segments.push({
        segmentId: `day_${day.day}_segment_1`,
        dayIndex: day.day,
        distanceKm: estimatedDistanceKm,
        ascentM: totalAscentM,
        slopePct: Math.min(estimatedSlopePct, 50), // 限制在 50% 以内
        metadata: {
          fromPoiId: firstSlot?.poiId,
          toPoiId: lastSlot?.poiId,
          maxElevation,
          minElevation,
          date: day.date,
        },
      });
    }

    return {
      tripId,
      routeDirectionId,
      segments,
    };
  }

  /**
   * 将 RoutePlanDraft 转换回 TripPlan（更新现有 plan）
   * 
   * 注意：这是增量更新，只更新被修改的部分
   */
  applyRoutePlanDraftToTripPlan(
    draft: RoutePlanDraft,
    originalPlan: TripPlan,
    _world: TripWorldState
  ): TripPlan {
    const updatedDays = [...originalPlan.days];

    // 按天分组 segments
    const segmentsByDay = new Map<number, RouteSegment[]>();
    for (const segment of draft.segments) {
      const dayIndex = segment.dayIndex;
      if (!segmentsByDay.has(dayIndex)) {
        segmentsByDay.set(dayIndex, []);
      }
      segmentsByDay.get(dayIndex)!.push(segment);
    }

    // 更新对应天的 terrainFacts
    for (const [dayIndex, segments] of segmentsByDay.entries()) {
      const day = updatedDays[dayIndex - 1]; // dayIndex 从 1 开始
      if (!day) continue;

      // 计算累计爬升
      const totalAscentM = segments.reduce((sum, seg) => sum + seg.ascentM, 0);
      const maxElevation = Math.max(
        ...segments.map(seg => seg.metadata?.maxElevation || 0)
      );
      const minElevation = Math.min(
        ...segments.map(seg => seg.metadata?.minElevation || maxElevation)
      );

      // 更新 terrainFacts
      day.terrainFacts = {
        ...day.terrainFacts,
        totalAscent: totalAscentM,
        maxElevation: maxElevation || day.terrainFacts?.maxElevation,
        minElevation: minElevation !== maxElevation ? minElevation : day.terrainFacts?.minElevation,
      };

      // 如果有新的 segments，可能需要更新 timeSlots（简化处理）
      // 这里暂时只更新 terrainFacts，timeSlots 保持不变
    }

    return {
      ...originalPlan,
      days: updatedDays,
    };
  }
}

