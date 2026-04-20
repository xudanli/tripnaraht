// src/trips/decision/tot/plan-converter.ts

/**
 * 计划转换工具
 * 
 * 用于在 RoutePlanDraft 和 TripPlan 之间转换
 * 简化版本，用于 MVP
 */

import { RoutePlanDraft, RouteSegment } from '../shared/world-model.types';
import { TripPlan, PlanDay, PlanSlot } from '../plan-model';
import { TripWorldState, TravelLeg } from '../world-model';

function timeToMinutes(t: string): number {
  const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return 9 * 60;
  return Math.max(0, Math.min(23 * 60 + 59, Number(m[1]) * 60 + Number(m[2])));
}

/**
 * 将 RoutePlanDraft 转换为 TripPlan（简化版）
 * 
 * 注意：这是 MVP 版本，实际转换可能需要更复杂的逻辑
 */
export function convertRoutePlanDraftToTripPlan(
  draft: RoutePlanDraft,
  world: TripWorldState
): TripPlan {
  // 简化处理：从 segments 构建 days
  const days: PlanDay[] = [];
  
  // 按 dayIndex 分组 segments
  const segmentsByDay = new Map<number, RouteSegment[]>();
  
  for (const segment of draft.segments) {
    const dayIndex = segment.dayIndex ?? 0;
    if (!segmentsByDay.has(dayIndex)) {
      segmentsByDay.set(dayIndex, []);
    }
    segmentsByDay.get(dayIndex)!.push(segment);
  }

  // 构建 PlanDay
  let dayNumber = 1;
  for (const [dayIndex, segments] of segmentsByDay.entries()) {
    const timeSlots: PlanSlot[] = [];
    
    // 简化处理：从 segments 构建 slots
    // 实际应该考虑 segment 的 startTime/endTime 等信息
    // 注意：RouteSegment 可能没有 poiId，需要从 metadata 或其他字段获取
    // Sort by startTime if present to preserve order for connectivity.
    const ordered = [...segments].sort((a, b) => {
      const ta = timeToMinutes((a.metadata as any)?.startTime ?? '09:00');
      const tb = timeToMinutes((b.metadata as any)?.startTime ?? '09:00');
      return ta - tb;
    });

    let prevSlot: PlanSlot | undefined;
    for (const segment of ordered) {
      // 从 metadata 中提取 POI 信息（简化处理）
      const metadata = segment.metadata || {};
      const poiId = metadata.poiId || metadata.poi_id;
      const poiName = metadata.poiName || metadata.poi_name || 'Activity';
      
      if (poiId) {
        const slot: PlanSlot = {
          id: `slot_${segment.segmentId}`,
          time: metadata.startTime || '09:00',
          endTime: metadata.endTime,
          title: poiName,
          type: 'sightseeing',
          poiId: String(poiId),
          coordinates: metadata.startLocation ? {
            lat: metadata.startLocation.lat,
            lng: metadata.startLocation.lng,
          } : undefined,
        };

        // Optional: carry travel leg from metadata or construct from travelDurationMinFromPrev.
        const mdLeg = (metadata as any)?.travelLegFromPrev as TravelLeg | undefined;
        if (mdLeg) {
          slot.travelLegFromPrev = mdLeg;
        } else if ((metadata as any)?.travelDurationMinFromPrev && prevSlot?.coordinates && slot.coordinates) {
          slot.travelLegFromPrev = {
            mode: 'drive',
            from: prevSlot.coordinates,
            to: slot.coordinates,
            durationMin: Number((metadata as any).travelDurationMinFromPrev) || 0,
          };
        }

        timeSlots.push(slot);
        prevSlot = slot;
      }
    }

    // 计算日期（简化处理）
    const date = addDays(world.context.startDate, dayIndex);

    days.push({
      day: dayNumber++,
      date,
      timeSlots,
    });
  }

  return {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    days,
  };
}

/**
 * 简单的日期加法（ISO 8601 date）
 */
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

