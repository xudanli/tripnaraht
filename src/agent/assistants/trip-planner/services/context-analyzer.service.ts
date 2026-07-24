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
import type {
  ItinerarySlotPlacementGapResult,
  SlotPlacementSignalSource,
  SuggestedItineraryDaySlot,
} from '../interfaces/itinerary-slot-placement.interface';

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
   * Layer1 行程槽位编排：结合缺口检测、地理/时间语义与 gap 关联，推荐插入日。
   * route_and_run INTAKE 调用；失败时由编排器回退启发式打分。
   */
  analyzeItinerarySlotPlacement(
    message: string,
    tripContext: TripContext,
  ): ItinerarySlotPlacementGapResult {
    const analysisPath: string[] = ['analyzeItinerarySlotPlacement'];
    const isPlacementRequested = this.isItineraryPlacementRequest(message);
    analysisPath.push(`placement_requested=${isPlacementRequested}`);

    if (!isPlacementRequested || tripContext.days.length === 0) {
      return {
        isPlacementRequested,
        suggestedDays: [],
        confidence: 0,
        analysisPath,
        activityAnchors: [],
        temporalHints: [],
      };
    }

    const activityAnchors = this.extractSlotActivityAnchors(message);
    const temporalHints = this.extractSlotTemporalHints(message);
    analysisPath.push(`anchors=${activityAnchors.join('|') || 'none'}`);
    analysisPath.push(`temporal=${temporalHints.join('|') || 'none'}`);

    const gaps = this.detectGaps(tripContext);
    const gapRelation = this.analyzeRequestGapRelation(message, 'ADD_ACTIVITY', gaps);
    if (gapRelation.related) {
      analysisPath.push(
        `gap_relation:type=${gapRelation.requestedType},matches=${gapRelation.matchedGaps.length}`,
      );
    }

    const dayScores = new Map<
      number,
      {
        score: number;
        reasons: string[];
        sources: Set<SlotPlacementSignalSource>;
        availableHours?: number;
        dateYmd: string;
        labelHint?: string;
        hasFreeTimeGap: boolean;
      }
    >();

    const ensureDay = (dayNumber: number, dateYmd: string) => {
      if (!dayScores.has(dayNumber)) {
        dayScores.set(dayNumber, {
          score: 0,
          reasons: [],
          sources: new Set(),
          dateYmd,
          hasFreeTimeGap: false,
        });
      }
      return dayScores.get(dayNumber)!;
    };

    const totalDays = tripContext.durationDays || tripContext.days.length;
    const northCorridor =
      /胡萨维克|husav[ií]k|husavik|阿克雷里|akureyri|米湖|mývatn|myvatn|北部/i;
    const highlandDayNumbers = tripContext.days
      .filter((d) => /高地|highland|f208|landmann|内陆/i.test(this.buildDayTextBlob(d)))
      .map((d) => d.dayNumber);
    const firstHighlandDay =
      highlandDayNumbers.length > 0 ? Math.min(...highlandDayNumbers) : totalDays + 1;

    for (const day of tripContext.days) {
      const blob = this.buildDayTextBlob(day);
      const entry = ensureDay(day.dayNumber, day.date);

      // 地理 / 活动锚点
      for (const anchor of activityAnchors) {
        if (blob.includes(anchor) || this.anchorMatchesDay(anchor, day, blob)) {
          entry.score += 3;
          entry.sources.add('GEOGRAPHIC_PROXIMITY');
          entry.reasons.push(`当日行程与「${anchor}」相关`);
        }
      }
      if (northCorridor.test(blob) && activityAnchors.some((a) => /观鲸|胡萨维克|husavik/i.test(a))) {
        entry.score += 2;
        entry.sources.add('GEOGRAPHIC_PROXIMITY');
        entry.reasons.push('当日位于北部走廊，与观鲸港口顺路');
      }

      // 交通走廊（相邻 POI 名称出现在锚点中）
      const poiNames = day.items.map((i) => i.name).filter(Boolean);
      if (
        activityAnchors.some((a) => poiNames.some((n) => n.includes(a) || a.includes(n))) &&
        poiNames.length >= 1
      ) {
        entry.score += 2.5;
        entry.sources.add('TRANSPORT_CORRIDOR');
        entry.reasons.push('与您提到的沿途景点在同一天');
      }

      // 相对宽松日
      const relaxed =
        day.stats.itemCount <= 3 ||
        day.stats.freeTime >= this.config.minFreeTimeForGap;
      if (relaxed) {
        entry.score += 1;
        entry.sources.add('RELAXED_DAY');
        if (day.stats.itemCount <= 2) {
          entry.reasons.push('当日已排活动较少，空档相对充裕');
        } else {
          entry.reasons.push('当日节奏相对宽松，可挤出插入窗口');
        }
      }

      // 时间语义
      for (const hint of temporalHints) {
        if (hint === 'SECOND_HALF' && day.dayNumber > Math.ceil(totalDays * 0.5)) {
          entry.score += 2;
          entry.sources.add('TEMPORAL_HINT');
          entry.reasons.push('符合您说的「行程后半段」');
        }
        if (hint === 'FIRST_HALF' && day.dayNumber <= Math.ceil(totalDays * 0.5)) {
          entry.score += 2;
          entry.sources.add('TEMPORAL_HINT');
          entry.reasons.push('符合您说的「行程前半段」');
        }
        if (hint === 'BEFORE_RETURN' && day.dayNumber >= Math.max(1, totalDays - 2)) {
          entry.score += 1.5;
          entry.sources.add('TEMPORAL_HINT');
          entry.reasons.push('接近返程段，便于衔接回城');
        }
        if (hint === 'RELAXED_DAY' && relaxed) {
          entry.score += 2;
          entry.sources.add('TEMPORAL_HINT');
          entry.reasons.push('符合您说的「比较闲」的一天');
        }
        if (hint === 'ALONG_ROUTE' && entry.score > 0) {
          entry.score += 1;
          entry.sources.add('TEMPORAL_HINT');
          entry.reasons.push('与您描述的顺路安排一致');
        }
        if (hint === 'BEFORE_HIGHLAND' && day.dayNumber < firstHighlandDay) {
          entry.score += 2;
          entry.sources.add('TEMPORAL_HINT');
          entry.reasons.push('位于内陆/高地段之前，适合作为进山前插入日');
        }
      }

      if (/米湖|myvatn/i.test(blob)) {
        entry.labelHint = '米湖 → 阿克雷里方向';
      } else if (/胡萨维克|husavik/i.test(blob)) {
        entry.labelHint = '胡萨维克周边';
      } else if (/阿克雷里|akureyri/i.test(blob)) {
        entry.labelHint = '阿克雷里周边';
      }
    }

    // 缺口关联：FREE_TIME / ACTIVITY
    if (gapRelation.related) {
      for (const gap of gapRelation.matchedGaps) {
        const entry = ensureDay(gap.dayNumber, gap.date);
        const hours = this.gapDurationHours(gap);
        entry.score += gap.severity === 'CRITICAL' ? 4 : gap.type === 'FREE_TIME' ? 3 : 2;
        entry.sources.add(gap.type === 'FREE_TIME' ? 'FREE_TIME_GAP' : 'ACTIVITY_GAP');
        if (gap.type === 'FREE_TIME') {
          entry.hasFreeTimeGap = true;
        }
        if (hours > 0) {
          entry.availableHours = hours;
        }
        const detail = this.formatGapDescription(gap, true);
        entry.reasons.push(detail);
        if (gap.context.beforeActivity && gap.context.afterActivity) {
          entry.labelHint = `${gap.context.beforeActivity.name} → ${gap.context.afterActivity.name}`;
        }
      }
    }

    const freeGapsByDay = new Set(
      gaps.filter((g) => g.type === 'FREE_TIME').map((g) => g.dayNumber),
    );

    const suggestedDays: SuggestedItineraryDaySlot[] = [...dayScores.entries()]
      .filter(([, v]) => v.score > 0)
      .map(([dayNumber, v]) => {
        const uniqueReasons = [...new Set(v.reasons)].slice(0, 3);
        const confidence = Math.min(0.95, 0.45 + v.score * 0.08);
        const dayCtx = tripContext.days.find((d) => d.dayNumber === dayNumber);
        const hasFreeTimeGap =
          v.hasFreeTimeGap ||
          freeGapsByDay.has(dayNumber) ||
          (v.availableHours ?? 0) >= 2;
        const geoRecommended =
          v.sources.has('GEOGRAPHIC_PROXIMITY') || v.sources.has('TRANSPORT_CORRIDOR');
        const itemHeavy =
          (dayCtx?.stats.itemCount ?? 0) >= 4 ||
          (dayCtx?.stats.freeTime ?? 0) < 120;
        const scheduleTight = geoRecommended && !hasFreeTimeGap && itemHeavy;
        const anchorNames = dayCtx?.items
          .slice(0, 2)
          .map((i) => i.name)
          .filter(Boolean)
          .join('、');
        const tightScheduleNoteZh = scheduleTight
          ? anchorNames
            ? `地理顺路，但当天已有${anchorNames}等安排，行程较紧凑`
            : '地理顺路，但当日已排活动较多，行程较紧凑'
          : undefined;

        return {
          dayNumber,
          dateYmd: v.dateYmd,
          reasonZh: uniqueReasons.join('；') || '根据行程上下文推荐',
          availableHours: v.availableHours,
          confidence,
          sources: [...v.sources],
          labelHint: v.labelHint,
          hasFreeTimeGap,
          scheduleTight,
          tightScheduleNoteZh,
        };
      })
      .sort((a, b) => b.confidence - a.confidence || a.dayNumber - b.dayNumber)
      .slice(0, 3);

    const overallConfidence =
      suggestedDays.length > 0 ? suggestedDays[0].confidence : 0;

    if (suggestedDays.length === 0 && isPlacementRequested) {
      analysisPath.push('graph_fracture:empty_suggested_days');
    }

    return {
      isPlacementRequested,
      suggestedDays,
      confidence: overallConfidence,
      analysisPath,
      activityAnchors,
      temporalHints,
    };
  }

  private isItineraryPlacementRequest(message: string): boolean {
    const t = String(message ?? '').trim();
    if (!t) return false;
    return (
      /哪一天|哪几天|哪个行程|哪一程|安排在哪|加在哪|插在|放进|能否在.{0,24}安排|顺路/i.test(t) &&
      (/行程|第\s*\d+\s*天|D\s*\d+/i.test(t) ||
        /观鲸|瀑布|胡萨维克|阿克雷里|活动|安排|加/i.test(t))
    );
  }

  private extractSlotActivityAnchors(message: string): string[] {
    const anchors = new Set<string>();
    const t = message;
    if (/观鲸|whale/i.test(t)) {
      anchors.add('观鲸');
      anchors.add('胡萨维克');
    }
    if (/瀑布|waterfall|seljalands|skóga|gullfoss/i.test(t)) {
      anchors.add('瀑布');
    }
    if (/胡萨维克|husav[ií]k|husavik/i.test(t)) anchors.add('胡萨维克');
    if (/阿克雷里|akureyri/i.test(t)) anchors.add('阿克雷里');
    if (/米湖|mývatn|myvatn/i.test(t)) anchors.add('米湖');
    if (/黄金圈|golden/i.test(t)) anchors.add('黄金圈');
    return [...anchors];
  }

  private extractSlotTemporalHints(message: string): string[] {
    const hints: string[] = [];
    const t = message;
    if (/后半|后段|后几天|后面几天/i.test(t)) hints.push('SECOND_HALF');
    if (/前半|前几天|开头几天/i.test(t)) hints.push('FIRST_HALF');
    if (/回.+雷克|返回雷克|回城|回雷市/i.test(t)) hints.push('BEFORE_RETURN');
    if (/闲|空档|宽松|不太满|有空/i.test(t)) hints.push('RELAXED_DAY');
    if (/顺路/i.test(t)) hints.push('ALONG_ROUTE');
    if (/进山前|高地前|f\s*路前/i.test(t)) hints.push('BEFORE_HIGHLAND');
    return hints;
  }

  private buildDayTextBlob(day: TripDayContext): string {
    const parts = [day.theme, day.city, ...day.items.map((i) => [i.name, i.nameCN, i.notes].join(' '))];
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  private anchorMatchesDay(anchor: string, day: TripDayContext, blob: string): boolean {
    const a = anchor.toLowerCase();
    if (blob.includes(a)) return true;
    if (/观鲸|whale/i.test(a)) {
      return /北部|north|husavik|husavík|akureyri|米湖|myvatn/i.test(blob);
    }
    return false;
  }

  private gapDurationHours(gap: ItineraryGap): number {
    const start = this.timeToMinutes(gap.timeSlot.start);
    const end = this.timeToMinutes(gap.timeSlot.end);
    if (end <= start) return 0;
    return Math.round(((end - start) / 60) * 10) / 10;
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
