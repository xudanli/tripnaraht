/**
 * Travel World Model - Best Visit Time Resolver
 *
 * 解析 Place 的 bestVisitTime 与 TimeSlot 的匹配度
 * 降级：无数据时返回 1.0（不惩罚）
 *
 * @see docs/TRAVEL_WORLD_MODEL_EXECUTION_PLAN.md
 */

import { Injectable } from '@nestjs/common';
import { TimeSlot } from '../dto/trip-draft.dto';

export type BestVisitTime = 'morning' | 'afternoon' | 'evening' | 'any';

export interface PlaceWithBestVisitTime {
  physicalMetadata?: { bestVisitTime?: BestVisitTime };
  metadata?: { bestVisitTime?: BestVisitTime };
  category?: string;
}

@Injectable()
export class BestVisitTimeResolver {
  /**
   * 计算 Place 在指定 TimeSlot 的匹配分数 (0-1)
   * 1.0 = 完美匹配，0.5 = 中性（无数据或 any），<1 = 不推荐
   */
  matchScore(place: PlaceWithBestVisitTime, slot: TimeSlot): number {
    const bvt = this.getBestVisitTime(place);
    if (!bvt || bvt === 'any') return 1.0;

    const slotMap: Record<TimeSlot, BestVisitTime[]> = {
      [TimeSlot.MORNING]: ['morning'],
      [TimeSlot.LUNCH]: ['morning', 'afternoon', 'any'],
      [TimeSlot.AFTERNOON]: ['afternoon'],
      [TimeSlot.DINNER]: ['afternoon', 'evening', 'any'],
      [TimeSlot.EVENING]: ['evening'],
    };
    const preferred = slotMap[slot];
    if (preferred?.includes(bvt)) return 1.0;

    // 软惩罚：不匹配但不至于完全排除
    const softPenalty: Record<BestVisitTime, Partial<Record<TimeSlot, number>>> = {
      morning: { [TimeSlot.EVENING]: 0.5 },
      afternoon: { [TimeSlot.MORNING]: 0.6, [TimeSlot.EVENING]: 0.7 },
      evening: { [TimeSlot.MORNING]: 0.5, [TimeSlot.AFTERNOON]: 0.6 },
      any: {},
    };
    return softPenalty[bvt]?.[slot] ?? 0.8;
  }

  /**
   * 从 Place 提取 bestVisitTime
   */
  getBestVisitTime(place: PlaceWithBestVisitTime): BestVisitTime | undefined {
    const pm = place.physicalMetadata as { bestVisitTime?: BestVisitTime } | undefined;
    const mm = place.metadata as { bestVisitTime?: BestVisitTime } | undefined;
    return pm?.bestVisitTime ?? mm?.bestVisitTime;
  }

  /**
   * 是否为活动类时段（morning/afternoon/evening），餐厅时段用 category 判断
   */
  isActivitySlot(slot: TimeSlot): boolean {
    return [TimeSlot.MORNING, TimeSlot.AFTERNOON, TimeSlot.EVENING].includes(slot);
  }
}
