// src/railpass/services/travel-day-calculation-engine.service.ts

/**
 * Travel Day 计算引擎
 * 
 * 计算 Flexi Pass 的 Travel Day 消耗，特别是跨午夜规则
 * 
 * 关键规则：
 * - 不跨午夜换乘 → 1 travel day（出发日）
 * - 跨午夜换乘 → 2 天（出发日 + 到达日）
 * - Continuous Pass 不涉及 Travel Day 计算（整个有效期都可用）
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  RailSegment,
  RailPassProfile,
  TravelDayCalculationResult,
  ISODate,
} from '../interfaces/railpass.interface';

interface CalculateTravelDaysInput {
  segments: RailSegment[];
  passProfile: RailPassProfile;
}

@Injectable()
export class TravelDayCalculationEngineService {
  private readonly logger = new Logger(TravelDayCalculationEngineService.name);

  /**
   * 计算 Travel Days 消耗
   * 
   * 规则（Flexi Pass）：
   * 1. 直达夜车且午夜后不换乘 → 只消耗出发日的 1 个 Travel Day
   * 2. 如果午夜后换乘 → 消耗 2 个 Travel Day（出发日 + 到达日）
   * 3. 非夜车 → 消耗出发日的 1 个 Travel Day
   */
  calculateTravelDays(input: CalculateTravelDaysInput): TravelDayCalculationResult {
    const { segments, passProfile } = input;

    // Continuous Pass 不涉及 Travel Day 计算
    if (passProfile.validityType === 'CONTINUOUS') {
      return {
        totalDaysUsed: 0, // Continuous 不消耗 Travel Day
        daysByDate: {},
        remainingDays: undefined,
      };
    }

    // Flexi Pass 计算
    const daysByDate: Record<ISODate, {
      consumed: boolean;
      segments: string[];
      crossesMidnight?: boolean;
      explanation: string;
    }> = {};

    // 按日期分组 segments（Travel Day 是自然日 00:00-23:59，不是 24 小时滚动）
    const segmentsByDate = new Map<ISODate, RailSegment[]>();
    for (const seg of segments) {
      const date = seg.departureDate; // 使用 departureDate 作为自然日
      if (!segmentsByDate.has(date)) {
        segmentsByDate.set(date, []);
      }
      segmentsByDate.get(date)!.push(seg);
    }

    // 重要：Interrail 居住国规则：同一天多次换乘仍算 1 travel day
    // 需要检查居住国段，如果是同一天的多次换乘，只消耗 1 天
    // （outbound/inbound 各自允许多次换乘，但都算在同一天内）

    // 计算每日消耗
    let totalDaysUsed = 0;

    for (const [date, segs] of segmentsByDate.entries()) {
      let consumed = false;
      let crossesMidnight = false;
      const segmentIds: string[] = [];

      for (const seg of segs) {
        segmentIds.push(seg.segmentId);

        // 判断是否消耗 Travel Day
        if (seg.isNightTrain) {
          // 夜车计日规则：
          // - 不换乘（直达夜车）：只算出发日 1 天
          // - 过午夜换乘：算 2 天（出发日 + 到达日）
          // 注意：这里简化处理，如果 crossesMidnight=true 就假设是过午夜换乘
          // 实际应该根据具体的列车时刻表判断是否有换乘
          if (seg.crossesMidnight) {
            // 跨午夜 → 需要 2 个 travel day（假设有换乘）
            crossesMidnight = true;
            consumed = true;
            // 注意：跨午夜换乘的情况，需要标记两天都消耗
            // 到达日的消耗在到达日处理
          } else {
            // 直达夜车，不跨午夜 → 只消耗出发日 1 天
            consumed = true;
          }
        } else {
          // 非夜车 → 消耗出发日 1 天（自然日 00:00-23:59）
          consumed = true;
        }
      }

      if (consumed) {
        totalDaysUsed++;
        daysByDate[date] = {
          consumed: true,
          segments: segmentIds,
          crossesMidnight,
          explanation: this.generateDayExplanation(segs, crossesMidnight),
        };

        // 如果有跨午夜的情况，也需要标记到达日消耗
        // 简化处理：这里假设跨午夜意味着到达日是第二天
        if (crossesMidnight) {
          // 计算到达日（date + 1 day）
          const arrivalDate = this.addDays(date, 1);
          if (!daysByDate[arrivalDate]) {
            totalDaysUsed++;
            daysByDate[arrivalDate] = {
              consumed: true,
              segments: segmentIds,
              crossesMidnight: true,
              explanation: `跨午夜夜车到达日，与出发日 ${date} 共享 Travel Day`,
            };
          }
        }
      }
    }

    // 计算剩余 Travel Days
    const remainingDays = passProfile.travelDaysTotal 
      ? Math.max(0, passProfile.travelDaysTotal - totalDaysUsed)
      : undefined;

    // 检查是否超限
    const violations: TravelDayCalculationResult['violations'] = [];
    if (passProfile.travelDaysTotal && totalDaysUsed > passProfile.travelDaysTotal) {
      violations.push({
        date: Object.keys(daysByDate).sort()[0],
        message: `Travel Days 超限：已用 ${totalDaysUsed} 天，Pass 仅 ${passProfile.travelDaysTotal} 天`,
      });
    }

    return {
      totalDaysUsed,
      daysByDate,
      remainingDays,
      violations,
    };
  }

  /**
   * 生成单日说明
   */
  private generateDayExplanation(
    segments: RailSegment[],
    crossesMidnight: boolean
  ): string {
    const parts: string[] = [];

    if (segments.length === 1) {
      const seg = segments[0];
      if (seg.isNightTrain) {
        if (crossesMidnight) {
          parts.push('夜车跨午夜，消耗 2 个 Travel Day');
        } else {
          parts.push('直达夜车，消耗 1 个 Travel Day');
        }
      } else {
        parts.push('当日列车，消耗 1 个 Travel Day');
      }
    } else {
      parts.push(`${segments.length} 段行程`);
      if (crossesMidnight) {
        parts.push('含跨午夜换乘，消耗 2 个 Travel Day');
      } else {
        parts.push('消耗 1 个 Travel Day');
      }
    }

    return parts.join('，');
  }

  /**
   * 添加天数（简单实现）
   */
  private addDays(dateStr: ISODate, days: number): ISODate {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0] as ISODate;
  }

  /**
   * 模拟 Travel Day 消耗（用于推荐阶段）
   * 
   * 根据预期的行程安排，估算 Travel Day 消耗
   */
  simulateTravelDays(args: {
    segments: RailSegment[];
    passProfile: RailPassProfile;
  }): TravelDayCalculationResult {
    return this.calculateTravelDays(args);
  }
}
