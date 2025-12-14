// src/schedule-action/utils/timeline-rebuilder.util.ts

import { PlannedStop } from '../../planning-policy/interfaces/scheduler.interface';
import { Poi } from '../../planning-policy/interfaces/poi.interface';
import { calculateDistance } from '../../planning-policy/utils/time-utils';

// 定义上午时段配置（可配置）
const MORNING_START_MIN = 360; // 06:00
const MORNING_END_MIN = 720; // 12:00

/**
 * 时间轴重建器工具
 * 
 * 用于在移动 POI 后重新计算时间轴，确保时间合理性
 */
export class TimelineRebuilder {
  /**
   * 配置选项
   */
  private readonly config = {
    /** 上午时段开始（分钟数） */
    morningStartMin: MORNING_START_MIN,
    /** 上午时段结束（分钟数） */
    morningEndMin: MORNING_END_MIN,
    /** 默认交通时间（分钟，用于估算） */
    defaultTransitMin: 30,
    /** 默认缓冲时间（分钟） */
    defaultBufferMin: 10,
  };

  /**
   * 重建时间轴（移动 POI 到上午后）
   * 
   * @param stops 所有 stops（包括移动后的目标 POI）
   * @param targetPoi 目标 POI 的完整信息（用于获取 avgVisitMin, openingHours 等）
   * @param targetStopIndex 目标 POI 在新 stops 数组中的索引
   * @param dayStartMin 当天开始时间（分钟）
   * @param dayEndMin 当天结束时间（分钟）
   * @returns 重建后的 stops，如果无法重建则返回 null（应回退到仅重排）
   */
  rebuildTimeline(
    stops: PlannedStop[],
    targetPoi: Poi | null,
    targetStopIndex: number,
    dayStartMin: number = 540, // 默认 9:00
    dayEndMin: number = 1200 // 默认 20:00
  ): PlannedStop[] | null {
    // 如果缺少 POI 信息，无法重建
    if (!targetPoi) {
      return null;
    }

    const newStops = [...stops];
    const targetStop = newStops[targetStopIndex];

    // 计算目标 POI 的访问时长
    const visitMin = targetPoi.avgVisitMin || 120;

    // 找到目标 POI 应该插入的位置（上午时间段）
    // 尝试找到一个合适的时间段
    let suggestedStartMin = this.findAvailableMorningSlot(
      newStops,
      targetStopIndex,
      visitMin,
      targetPoi,
      dayStartMin
    );

    if (suggestedStartMin === null) {
      // 无法找到合适的时间段，回退到仅重排
      return null;
    }

      // 计算交通时间（从上一个 stop 到目标 POI）
      let transitMin = this.config.defaultTransitMin;
      if (targetStopIndex > 0) {
        const prevStop = newStops[targetStopIndex - 1];
        if (
          typeof prevStop.lat === 'number' &&
          typeof prevStop.lng === 'number' &&
          typeof targetPoi.lat === 'number' &&
          typeof targetPoi.lng === 'number'
        ) {
          const distanceM = calculateDistance(
            prevStop.lat,
            prevStop.lng,
            targetPoi.lat,
            targetPoi.lng
          ); // 返回米
          const distanceKm = distanceM / 1000; // 转换为公里
          // 估算交通时间：步行 5km/h
          transitMin = Math.max(
            this.config.defaultTransitMin,
            Math.round((distanceKm / 5) * 60) // 步行时间（5km/h）
          );
        }
      }

    // 计算到达时间（考虑交通）
    const arriveMin = suggestedStartMin - transitMin;
    
    // 检查营业时间约束
    if (targetPoi.openingHours) {
      // 简化：如果目标 POI 有营业时间，检查是否可以在这个时间到达
      // 这里先做基础检查，详细的营业时间检查需要更复杂的逻辑
      const earliestArrival = this.getEarliestArrivalTime(
        targetPoi,
        dayStartMin
      );
      if (earliestArrival !== null && arriveMin < earliestArrival) {
        // 无法在这个时间到达（未开门），尝试调整
        suggestedStartMin = earliestArrival + transitMin;
        if (suggestedStartMin + visitMin > this.config.morningEndMin) {
          // 调整后超出上午时段，回退到仅重排
          return null;
        }
      }
    }

    // 检查是否超出边界
    if (suggestedStartMin + visitMin > dayEndMin) {
      return null;
    }

    // 更新目标 stop 的时间
    const newTargetStop: PlannedStop = {
      ...targetStop,
      startMin: suggestedStartMin,
      endMin: suggestedStartMin + visitMin,
    };

    newStops[targetStopIndex] = newTargetStop;

    // 递归调整后续 stops 的时间
    let currentTime = suggestedStartMin + visitMin + this.config.defaultBufferMin;
    for (let i = targetStopIndex + 1; i < newStops.length; i++) {
      const stop = newStops[i];
      const stopVisitMin = stop.endMin - stop.startMin;

      // 计算交通时间
      const prevStop = newStops[i - 1];
      let stopTransitMin = this.config.defaultTransitMin;
      if (
        typeof prevStop.lat === 'number' &&
        typeof prevStop.lng === 'number' &&
        typeof stop.lat === 'number' &&
        typeof stop.lng === 'number'
      ) {
        const distanceM = calculateDistance(
          prevStop.lat,
          prevStop.lng,
          stop.lat,
          stop.lng
        ); // 返回米
        const distanceKm = distanceM / 1000; // 转换为公里
        stopTransitMin = Math.max(
          this.config.defaultTransitMin,
          Math.round((distanceKm / 5) * 60) // 步行时间（5km/h）
        );
      }

      const stopArriveMin = currentTime + stopTransitMin;
      const stopStartMin = stopArriveMin; // 简化：不考虑等待时间
      const stopEndMin = stopStartMin + stopVisitMin;

      // 检查是否超出边界
      if (stopEndMin > dayEndMin) {
        // 超出边界，回退到仅重排
        return null;
      }

      newStops[i] = {
        ...stop,
        startMin: stopStartMin,
        endMin: stopEndMin,
      };

      currentTime = stopEndMin + this.config.defaultBufferMin;
    }

    return newStops;
  }

  /**
   * 找到上午时段中可用的时间槽
   */
  private findAvailableMorningSlot(
    stops: PlannedStop[],
    targetIndex: number,
    visitMin: number,
    targetPoi: Poi,
    dayStartMin: number
  ): number | null {
    // 收集上午时段已有的 stops（排除目标 stop）
    const morningStops = stops
      .map((s, i) => ({ stop: s, index: i }))
      .filter(
        ({ stop, index }) =>
          index !== targetIndex &&
          stop.kind === 'POI' &&
          stop.startMin >= this.config.morningStartMin &&
          stop.startMin < this.config.morningEndMin
      )
      .sort((a, b) => a.stop.startMin - b.stop.startMin);

    // 尝试在已有 stops 之间找到空隙
    let candidateStart = Math.max(dayStartMin, this.config.morningStartMin);

    for (const { stop } of morningStops) {
      // 检查在 stop 之前是否有足够空间
      const gap = stop.startMin - candidateStart;
      if (gap >= visitMin + this.config.defaultTransitMin * 2 + this.config.defaultBufferMin) {
        // 找到空隙，尝试放置在这里
        return candidateStart + this.config.defaultTransitMin;
      }

      // 更新候选开始时间为当前 stop 结束后
      candidateStart = stop.endMin + this.config.defaultTransitMin + this.config.defaultBufferMin;
    }

    // 检查最后一个 stop 之后是否有空间
    if (morningStops.length > 0) {
      const lastMorningStop = morningStops[morningStops.length - 1].stop;
      candidateStart = lastMorningStop.endMin + this.config.defaultTransitMin + this.config.defaultBufferMin;
    }

    // 检查是否能在上午时段内完成
    if (candidateStart + visitMin <= this.config.morningEndMin) {
      return candidateStart;
    }

    // 无法找到合适的时间段
    return null;
  }

  /**
   * 获取 POI 的最早到达时间（基于营业时间）
   */
  private getEarliestArrivalTime(poi: Poi, dayStartMin: number): number | null {
    if (!poi.openingHours) {
      return null;
    }

    // 简化实现：如果有 openingHours，返回第一个时间段的开始时间
    // 实际应该根据 dayOfWeek 和日期选择正确的时间段
    const hours = poi.openingHours;
    if (hours.windows && hours.windows.length > 0) {
      const firstWindow = hours.windows[0];
      if (firstWindow.start) {
        const [h, m] = firstWindow.start.split(':').map(Number);
        return h * 60 + m;
      }
    }

    return null;
  }
}
