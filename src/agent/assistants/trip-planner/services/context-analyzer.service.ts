// src/agent/assistants/trip-planner/services/context-analyzer.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  TripContext,
  TripDayContext,
  TripItemContext,
  TripPlannerIntent,
} from '../interfaces/trip-planner.interface';
import {
  ItineraryGap,
  ItineraryGapType,
  GapAnalysisConfig,
  DEFAULT_GAP_ANALYSIS_CONFIG,
  KEYWORD_TO_GAP_TYPE,
} from '../interfaces/intent-uncertainty.interface';

/**
 * 上下文分析服务
 * 
 * 职责：
 * 1. 检测行程中的缺口（用餐、住宿、交通、活动）
 * 2. 分析用户请求与缺口的关联性
 * 3. 提供上下文感知的建议
 */
@Injectable()
export class ContextAnalyzerService {
  private readonly logger = new Logger(ContextAnalyzerService.name);
  private readonly config: GapAnalysisConfig;

  constructor() {
    this.config = DEFAULT_GAP_ANALYSIS_CONFIG;
  }

  // ==================== 缺口检测 ====================

  /**
   * 检测行程中的所有缺口
   */
  detectGaps(tripContext: TripContext): ItineraryGap[] {
    const gaps: ItineraryGap[] = [];

    this.logger.debug(`[缺口检测] 分析 ${tripContext.durationDays} 天行程`);

    for (const day of tripContext.days) {
      // 1. 检测用餐缺口
      if (this.config.detectMealGaps) {
        const mealGaps = this.detectMealGaps(day, tripContext);
        gaps.push(...mealGaps);
      }

      // 2. 检测活动空档
      if (this.config.detectActivityGaps) {
        const activityGaps = this.detectActivityGaps(day, tripContext);
        gaps.push(...activityGaps);
      }

      // 3. 检测交通缺失
      if (this.config.detectTransportGaps) {
        const transportGaps = this.detectTransportGaps(day, tripContext);
        gaps.push(...transportGaps);
      }
    }

    // 4. 检测住宿缺失（跨天检测）
    if (this.config.detectHotelGaps) {
      const hotelGaps = this.detectHotelGaps(tripContext);
      gaps.push(...hotelGaps);
    }

    this.logger.debug(`[缺口检测] 发现 ${gaps.length} 个缺口`);
    return gaps;
  }

  /**
   * 检测用餐缺口
   */
  private detectMealGaps(day: TripDayContext, tripContext: TripContext): ItineraryGap[] {
    const gaps: ItineraryGap[] = [];

    for (const window of this.config.mealWindows) {
      // 检查该时间窗是否有餐厅安排
      const hasMealInWindow = day.items.some(item =>
        item.type === 'RESTAURANT' &&
        this.isTimeInWindow(item.startTime, window.start, window.end)
      );

      if (hasMealInWindow) {
        continue; // 已有餐厅安排
      }

      // 检查该时间段是否有其他活动（说明人在外面）
      const activitiesInWindow = day.items.filter(item =>
        item.type !== 'RESTAURANT' &&
        this.isTimeOverlapping(item.startTime, item.endTime, window.start, window.end)
      );

      // 只有当天有活动安排且用餐时间没有餐厅时，才算缺口
      if (activitiesInWindow.length > 0 || day.items.length > 0) {
        // 找到缺口前后的活动
        const beforeActivity = this.findActivityBefore(day.items, window.start);
        const afterActivity = this.findActivityAfter(day.items, window.end);

        // 计算已有餐厅数量
        const existingMealCount = day.items.filter(i => i.type === 'RESTAURANT').length;

        gaps.push({
          id: `gap_meal_${day.dayNumber}_${window.name}`,
          type: 'MEAL',
          dayNumber: day.dayNumber,
          date: day.date,
          timeSlot: { start: window.start, end: window.end },
          severity: window.required ? 'CRITICAL' : 'SUGGESTED',
          description: `第${day.dayNumber}天${window.name}未安排（${window.start}-${window.end}）`,
          context: {
            beforeActivity: beforeActivity ? {
              name: beforeActivity.name,
              endTime: beforeActivity.endTime || '',
            } : undefined,
            afterActivity: afterActivity ? {
              name: afterActivity.name,
              startTime: afterActivity.startTime || '',
            } : undefined,
            dayTheme: day.theme,
            dayCity: day.city,
            existingCount: existingMealCount,
          },
          suggestions: this.generateMealSuggestions(day, window, tripContext),
        });
      }
    }

    return gaps;
  }

  /**
   * 检测活动空档
   */
  private detectActivityGaps(day: TripDayContext, tripContext: TripContext): ItineraryGap[] {
    const gaps: ItineraryGap[] = [];

    // 按开始时间排序活动
    const sortedItems = [...day.items]
      .filter(item => item.startTime)
      .sort((a, b) => this.timeToMinutes(a.startTime!) - this.timeToMinutes(b.startTime!));

    if (sortedItems.length < 2) {
      return gaps; // 活动太少，不检测空档
    }

    // 检测活动之间的空档
    for (let i = 0; i < sortedItems.length - 1; i++) {
      const current = sortedItems[i];
      const next = sortedItems[i + 1];

      const currentEndMinutes = this.timeToMinutes(current.endTime || current.startTime!) +
        (current.duration || 60);
      const nextStartMinutes = this.timeToMinutes(next.startTime!);

      const gapMinutes = nextStartMinutes - currentEndMinutes;

      // 排除用餐时间的空档（那是用餐缺口，不是活动缺口）
      const gapStart = this.minutesToTime(currentEndMinutes);
      const gapEnd = this.minutesToTime(nextStartMinutes);
      const isMealTime = this.config.mealWindows.some(w =>
        this.isTimeOverlapping(gapStart, gapEnd, w.start, w.end)
      );

      if (gapMinutes >= this.config.minFreeTimeForGap && !isMealTime) {
        gaps.push({
          id: `gap_activity_${day.dayNumber}_${i}`,
          type: 'FREE_TIME',
          dayNumber: day.dayNumber,
          date: day.date,
          timeSlot: { start: gapStart, end: gapEnd },
          severity: 'OPTIONAL',
          description: `第${day.dayNumber}天${gapStart}-${gapEnd}有${Math.round(gapMinutes / 60)}小时空闲`,
          context: {
            beforeActivity: { name: current.name, endTime: current.endTime || '' },
            afterActivity: { name: next.name, startTime: next.startTime || '' },
            dayTheme: day.theme,
            dayCity: day.city,
            existingCount: day.items.filter(i => i.type === 'POI' || i.type === 'ACTIVITY').length,
          },
          suggestions: [`可以安排一个${day.city || tripContext.destinationName}的景点`],
        });
      }
    }

    return gaps;
  }

  /**
   * 检测交通缺失
   */
  private detectTransportGaps(day: TripDayContext, _tripContext: TripContext): ItineraryGap[] {
    const gaps: ItineraryGap[] = [];

    // 按时间排序的 POI/活动
    const poiItems = day.items
      .filter(item => ['POI', 'ACTIVITY', 'RESTAURANT'].includes(item.type) && item.startTime)
      .sort((a, b) => this.timeToMinutes(a.startTime!) - this.timeToMinutes(b.startTime!));

    if (poiItems.length < 2) {
      return gaps;
    }

    // 检测相邻 POI 之间是否有交通安排
    for (let i = 0; i < poiItems.length - 1; i++) {
      const current = poiItems[i];
      const next = poiItems[i + 1];

      // 检查两个 POI 之间是否有交通项目
      const hasTransport = day.items.some(item =>
        item.type === 'TRANSPORT' &&
        item.from === current.name &&
        item.to === next.name
      );

      if (!hasTransport && current.address !== next.address) {
        // 计算时间窗
        const transportStart = current.endTime ||
          this.minutesToTime(this.timeToMinutes(current.startTime!) + (current.duration || 60));
        const transportEnd = next.startTime!;

        gaps.push({
          id: `gap_transport_${day.dayNumber}_${i}`,
          type: 'TRANSPORT',
          dayNumber: day.dayNumber,
          date: day.date,
          timeSlot: { start: transportStart, end: transportEnd },
          severity: 'SUGGESTED',
          description: `${current.name} → ${next.name} 未安排交通`,
          context: {
            beforeActivity: { name: current.name, endTime: transportStart },
            afterActivity: { name: next.name, startTime: transportEnd },
            dayTheme: day.theme,
            dayCity: day.city,
            existingCount: day.items.filter(i => i.type === 'TRANSPORT').length,
          },
          suggestions: ['可以查询公共交通或打车方案'],
        });
      }
    }

    return gaps;
  }

  /**
   * 检测住宿缺失
   */
  private detectHotelGaps(tripContext: TripContext): ItineraryGap[] {
    const gaps: ItineraryGap[] = [];

    // 除了最后一天，每天晚上都应该有住宿
    for (let i = 0; i < tripContext.days.length - 1; i++) {
      const day = tripContext.days[i];

      const hasHotel = day.items.some(item => item.type === 'HOTEL');

      if (!hasHotel) {
        gaps.push({
          id: `gap_hotel_${day.dayNumber}`,
          type: 'HOTEL',
          dayNumber: day.dayNumber,
          date: day.date,
          timeSlot: { start: '21:00', end: '23:59' },
          severity: 'CRITICAL',
          description: `第${day.dayNumber}天未安排住宿`,
          context: {
            dayTheme: day.theme,
            dayCity: day.city,
            existingCount: 0,
          },
          suggestions: [`推荐在${day.city || tripContext.destinationName}预订酒店`],
        });
      }
    }

    return gaps;
  }

  // ==================== 关联性分析 ====================

  /**
   * 判断用户请求是否与当前缺口相关
   */
  analyzeRequestGapRelation(
    message: string,
    intent: TripPlannerIntent,
    gaps: ItineraryGap[],
  ): {
    related: boolean;
    matchedGaps: ItineraryGap[];
    bestMatch?: ItineraryGap;
    confidence: number;
    requestedType?: ItineraryGapType;
  } {
    // 1. 从消息中提取请求类型
    const requestedType = this.extractRequestedType(message);

    if (!requestedType) {
      return {
        related: false,
        matchedGaps: [],
        confidence: 0,
      };
    }

    // 2. 查找匹配的缺口
    const matchedGaps = gaps.filter(g => this.isGapTypeMatch(g.type, requestedType));

    if (matchedGaps.length === 0) {
      return {
        related: false,
        matchedGaps: [],
        confidence: 0,
        requestedType,
      };
    }

    // 3. 排序：优先 CRITICAL，然后按天数
    const sortedGaps = [...matchedGaps].sort((a, b) => {
      // 优先级：CRITICAL > SUGGESTED > OPTIONAL
      const severityOrder = { CRITICAL: 0, SUGGESTED: 1, OPTIONAL: 2 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;

      // 同级别按天数排序
      return a.dayNumber - b.dayNumber;
    });

    const bestMatch = sortedGaps[0];
    const confidence = bestMatch.severity === 'CRITICAL' ? 0.9 :
      bestMatch.severity === 'SUGGESTED' ? 0.7 : 0.5;

    return {
      related: true,
      matchedGaps: sortedGaps,
      bestMatch,
      confidence,
      requestedType,
    };
  }

  /**
   * 从消息中提取请求的缺口类型
   */
  private extractRequestedType(message: string): ItineraryGapType | null {
    for (const [keyword, type] of Object.entries(KEYWORD_TO_GAP_TYPE)) {
      if (message.includes(keyword)) {
        return type;
      }
    }
    return null;
  }

  /**
   * 判断缺口类型是否匹配
   */
  private isGapTypeMatch(gapType: ItineraryGapType, requestedType: ItineraryGapType): boolean {
    // 直接匹配
    if (gapType === requestedType) return true;

    // FREE_TIME 可以匹配 ACTIVITY
    if (gapType === 'FREE_TIME' && requestedType === 'ACTIVITY') return true;

    return false;
  }

  // ==================== 上下文摘要 ====================

  /**
   * 生成当天上下文摘要
   */
  generateDaySummary(day: TripDayContext): string {
    const mealCount = day.items.filter(i => i.type === 'RESTAURANT').length;
    const poiCount = day.items.filter(i => i.type === 'POI' || i.type === 'ACTIVITY').length;

    const parts: string[] = [];

    if (day.theme) {
      parts.push(`主题：${day.theme}`);
    }

    if (day.city) {
      parts.push(`地点：${day.city}`);
    }

    parts.push(`已安排：${poiCount}个景点、${mealCount}餐`);

    if (day.stats.freeTime > 60) {
      parts.push(`空闲：${Math.round(day.stats.freeTime / 60)}小时`);
    }

    return parts.join('，');
  }

  /**
   * 生成缺口描述
   */
  formatGapDescription(gap: ItineraryGap, detailed: boolean = false): string {
    const basic = gap.description;

    if (!detailed) {
      return basic;
    }

    const parts = [basic];

    if (gap.context.beforeActivity) {
      parts.push(`前一活动：${gap.context.beforeActivity.name}`);
    }

    if (gap.context.afterActivity) {
      parts.push(`后一活动：${gap.context.afterActivity.name}`);
    }

    if (gap.suggestions && gap.suggestions.length > 0) {
      parts.push(`建议：${gap.suggestions[0]}`);
    }

    return parts.join('；');
  }

  // ==================== 辅助方法 ====================

  /**
   * 检查时间是否在窗口内
   */
  private isTimeInWindow(time: string | Date | number | undefined | null, windowStart: string, windowEnd: string): boolean {
    if (time === undefined || time === null) return false;

    const timeMinutes = this.timeToMinutes(time);
    if (timeMinutes === 0 && time !== 0 && time !== '00:00') return false; // 解析失败
    
    const startMinutes = this.timeToMinutes(windowStart);
    const endMinutes = this.timeToMinutes(windowEnd);

    return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
  }

  /**
   * 检查两个时间段是否重叠
   */
  private isTimeOverlapping(
    start1: string | Date | number | undefined | null,
    end1: string | Date | number | undefined | null,
    start2: string,
    end2: string,
  ): boolean {
    if (start1 === undefined || start1 === null) return false;

    const s1 = this.timeToMinutes(start1);
    if (s1 === 0 && start1 !== 0 && start1 !== '00:00') return false; // 解析失败
    
    const e1 = end1 ? this.timeToMinutes(end1) : s1 + 60; // 默认1小时
    const s2 = this.timeToMinutes(start2);
    const e2 = this.timeToMinutes(end2);

    return !(e1 <= s2 || s1 >= e2);
  }

  /**
   * 时间字符串转分钟数
   * 支持多种输入格式：字符串 "14:00"、Date 对象、数字（分钟）
   */
  private timeToMinutes(time: string | Date | number | undefined | null): number {
    if (time === undefined || time === null) {
      return 0;
    }

    // 如果是数字，假设已经是分钟数
    if (typeof time === 'number') {
      return time;
    }

    // 如果是 Date 对象
    if (time instanceof Date) {
      return time.getHours() * 60 + time.getMinutes();
    }

    // 如果是字符串
    if (typeof time === 'string') {
      // 处理 ISO 格式的时间字符串 "2026-04-01T14:00:00.000Z"
      if (time.includes('T')) {
        const date = new Date(time);
        if (!isNaN(date.getTime())) {
          return date.getHours() * 60 + date.getMinutes();
        }
      }
      
      // 处理 "HH:mm" 格式
      if (time.includes(':')) {
        const [hours, minutes] = time.split(':').map(Number);
        return (hours || 0) * 60 + (minutes || 0);
      }
      
      // 尝试解析纯数字字符串
      const num = parseInt(time, 10);
      if (!isNaN(num)) {
        return num;
      }
    }

    this.logger.warn(`[时间解析] 无法解析时间: ${time} (类型: ${typeof time})`);
    return 0;
  }

  /**
   * 分钟数转时间字符串
   */
  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * 查找某时间之前的最近活动
   */
  private findActivityBefore(items: TripItemContext[], time: string | Date | number): TripItemContext | undefined {
    const timeMinutes = this.timeToMinutes(time);

    return items
      .filter(item => {
        if (!item.startTime) return false;
        const endMinutes = item.endTime
          ? this.timeToMinutes(item.endTime)
          : this.timeToMinutes(item.startTime) + (item.duration || 60);
        return endMinutes <= timeMinutes;
      })
      .sort((a, b) => {
        const aEnd = a.endTime ? this.timeToMinutes(a.endTime) : this.timeToMinutes(a.startTime!) + (a.duration || 60);
        const bEnd = b.endTime ? this.timeToMinutes(b.endTime) : this.timeToMinutes(b.startTime!) + (b.duration || 60);
        return bEnd - aEnd; // 降序，取最近的
      })[0];
  }

  /**
   * 查找某时间之后的最近活动
   */
  private findActivityAfter(items: TripItemContext[], time: string | Date | number): TripItemContext | undefined {
    const timeMinutes = this.timeToMinutes(time);

    return items
      .filter(item => item.startTime && this.timeToMinutes(item.startTime) >= timeMinutes)
      .sort((a, b) => this.timeToMinutes(a.startTime!) - this.timeToMinutes(b.startTime!))[0];
  }

  /**
   * 生成用餐建议
   */
  private generateMealSuggestions(
    day: TripDayContext,
    mealWindow: { name: string; start: string; end: string },
    tripContext: TripContext,
  ): string[] {
    const suggestions: string[] = [];
    const city = day.city || tripContext.destinationName;

    suggestions.push(`推荐在${city}附近寻找${mealWindow.name}地点`);

    // 根据前后活动推荐
    const beforeActivity = this.findActivityBefore(day.items, mealWindow.start);
    if (beforeActivity) {
      suggestions.push(`可以在${beforeActivity.name}附近用餐`);
    }

    return suggestions;
  }
}
