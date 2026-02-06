// src/trips/decision/strategies/dr-dre-strategy.service.ts
/**
 * Dr.Dre Strategy（结构修复者）
 * 
 * 第一性原理：必须完全以 HumanCapabilityModel 驱动
 * 
 * 法律：
 * ✔ 可以 ADJUST
 * ❌ 不得 REPLACE
 * ❌ 不得覆盖硬约束
 * 
 * 目标不是更轻松，而是"整体可持续"。
 * 
 * Dr.Dre 在整套系统里的位置：
 * - Abu：能不能走（物理现实）
 * - Dr.Dre：这样走下去几天后会不会崩（人体能力）
 * - Neptune：世界变了还能不能保持路线精神（路线哲学）
 * 
 * 约束：
 * ❌ 不允许突破 Abu 的硬约束
 * ❌ 不改 RouteDirection（大方向与哲学）
 * ✔ 只在 "每天怎么排" / "是否插休息日" 上动手脚
 * 
 * 第一性原理要求：
 * - 所有决策条件统一写成对 fatigueIndex、rollingAscent3DaysM 的判断
 * - PaceConstraints 100% 由 HumanCapabilityModel + RD softConstraints 生成
 * - 不再使用"魔法参数 if-else"，而是"人类能力模型驱动的控制器"
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DecisionPersonaStrategy } from './decision-persona-strategy.interface';
import {
  WorldModelContext,
  RoutePlanDraft,
  RouteSegment,
} from '../shared/world-model.types';
import { DecisionResult, DecisionAction, DecisionLogEntry, DecisionSource, DecisionStage } from '../shared/decision-result.types';
import { DayProfile, PaceConstraints, RollingFatigueIssue } from '../interfaces/day-profile.interface';
import { SplitOperation, BufferDayOperation, DrDreOperation } from '../interfaces/dr-dre-operation.interface';
import { FatigueCalculatorService } from '../services/fatigue-calculator.service';
import { AirbnbIntegrationService } from '../../../mcp/airbnb-integration.service';
import { BookingComIntegrationService } from '../../../mcp/booking-com-integration.service';

@Injectable()
export class DrDreStrategy implements DecisionPersonaStrategy {
  private readonly logger = new Logger(DrDreStrategy.name);
  readonly personaName = 'DR_DRE' as const;

  constructor(
    private readonly fatigueCalculator: FatigueCalculatorService,
    @Optional() private readonly airbnbIntegration?: AirbnbIntegrationService,
    @Optional() private readonly bookingComIntegration?: BookingComIntegrationService,
  ) {}

  /**
   * 评估计划
   * 
   * Dr.Dre v2 算法主流程：
   * 1. 生成 DayProfile 数组
   * 2. 标记问题天：overloadedDays / rollingFatigueWindows
   * 3. 根据用户画像和 RD 决策：先拆天还是先插休息
   * 4. 应用一轮调整（不要无限循环）
   * 5. 重新计算，写入 DecisionLog
   */
  async evaluate(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<DecisionResult> {
    this.logger.debug(`Dr.Dre 评估计划: ${plan.tripId}`);

    const pace = this.buildPaceConstraints(world);
    let dayProfiles = this.buildDayProfiles(plan, pace);

    // 0️⃣.5 检查住宿位置对路线节奏的影响（Airbnb 集成）
    if (this.airbnbIntegration && plan.segments.length > 0) {
      try {
        // 为每日路线检查住宿位置
        const segmentsByDay = new Map<number, RouteSegment[]>();
        for (const segment of plan.segments) {
          const dayIndex = segment.dayIndex || 0;
          if (!segmentsByDay.has(dayIndex)) {
            segmentsByDay.set(dayIndex, []);
          }
          segmentsByDay.get(dayIndex)!.push(segment);
        }

        for (const [dayIndex, daySegments] of segmentsByDay.entries()) {
          const lastSegment = daySegments[daySegments.length - 1];
          const endPointLocation = lastSegment.metadata?.endLocation || 
                                   lastSegment.metadata?.toLocation ||
                                   lastSegment.metadata?.coordinates;

          if (endPointLocation && endPointLocation.lat && endPointLocation.lng) {
            // 估算日期
            const currentYear = new Date().getFullYear();
            const month = world.physical.month;
            const dayDate = new Date(currentYear, month - 1, dayIndex + 1);
            const checkinDate = dayDate.toISOString().split('T')[0];
            const checkoutDate = new Date(dayDate.getTime() + 86400000).toISOString().split('T')[0];
            const partySize = (world.human as any)?.partySize || 2;

            // 检查住宿位置对路线节奏的影响
            const impact = await this.airbnbIntegration.checkAccommodationImpactOnPace(
              { lat: endPointLocation.lat, lng: endPointLocation.lng },
              checkinDate,
              checkoutDate,
              partySize,
            );

            // 如果影响较大（HIGH），调整该日的疲劳指数
            if (impact.impact === 'HIGH' && impact.distanceToNearestAccommodation > 10000) {
              // 增加额外的移动距离，影响疲劳指数
              const additionalDistanceKm = impact.distanceToNearestAccommodation / 1000;
              const dayProfile = dayProfiles.find(d => d.dayIndex === dayIndex);
              if (dayProfile) {
                // 增加距离和疲劳指数
                // 注意：DayProfile 没有 distanceKm 字段，这里只更新疲劳指数
                // dayProfile.distanceKm += additionalDistanceKm; // 已移除
                dayProfile.fatigueIndex = Math.min(
                  dayProfile.fatigueIndex * (1 + additionalDistanceKm / 50), // 每增加 50km 增加 100% 疲劳
                  2.0 // 限制最大疲劳指数
                );
                this.logger.debug(
                  `Day ${dayIndex}: 住宿距离 ${(impact.distanceToNearestAccommodation / 1000).toFixed(1)}km，调整疲劳指数至 ${dayProfile.fatigueIndex.toFixed(2)}`
                );
              }
            }
          }
        }
      } catch (error: any) {
        this.logger.warn(`Airbnb pace impact check failed: ${error.message}, continuing with original pace`);
        // 降级：继续使用原始节奏，不阻塞决策流程
      }
    }

    // 0️⃣.6 检查租车取车/还车位置对路线节奏的影响（Booking.com 集成）
    if (this.bookingComIntegration && plan.segments.length > 0) {
      try {
        const segmentsByDay = new Map<number, RouteSegment[]>();
        for (const segment of plan.segments) {
          const dayIndex = segment.dayIndex || 0;
          if (!segmentsByDay.has(dayIndex)) {
            segmentsByDay.set(dayIndex, []);
          }
          segmentsByDay.get(dayIndex)!.push(segment);
        }

        for (const [dayIndex, daySegments] of segmentsByDay.entries()) {
          const firstSegment = daySegments[0];
          const lastSegment = daySegments[daySegments.length - 1];
          
          const pickupLocation = firstSegment.metadata?.startLocation || 
                                firstSegment.metadata?.fromLocation ||
                                firstSegment.metadata?.coordinates;
          const dropoffLocation = lastSegment.metadata?.endLocation || 
                                 lastSegment.metadata?.toLocation ||
                                 lastSegment.metadata?.coordinates;

          if (pickupLocation && dropoffLocation && 
              pickupLocation.lat && pickupLocation.lng &&
              dropoffLocation.lat && dropoffLocation.lng) {
            
            // 估算日期和时间
            const currentYear = new Date().getFullYear();
            const month = world.physical.month;
            const dayDate = new Date(currentYear, month - 1, dayIndex + 1);
            const pickupTime = '10:00';
            const dropoffTime = '18:00';
            const driverAge = (world.human as any)?.driverAge || 25;

            // 检查租车对节奏的影响
            const impact = await this.bookingComIntegration.checkCarRentalImpactOnPace(
              pickupLocation,
              dropoffLocation,
              pickupTime,
              dropoffTime,
              driverAge,
            );

            // 如果影响较大（HIGH），调整该日的疲劳指数
            if (impact.impactLevel === 'HIGH') {
              const dayProfile = dayProfiles.find(d => d.dayIndex === dayIndex);
              if (dayProfile) {
                // 增加额外的移动距离（取车/还车位置偏离路线）
                const additionalDistanceKm = impact.distanceToPickupLocation / 1000;
                dayProfile.fatigueIndex = Math.min(
                  dayProfile.fatigueIndex * (1 + additionalDistanceKm / 50),
                  2.0
                );
                this.logger.debug(
                  `Day ${dayIndex}: 租车位置影响节奏，调整疲劳指数至 ${dayProfile.fatigueIndex.toFixed(2)}`
                );
              }
            }
          }
        }
      } catch (error: any) {
        this.logger.warn(`Booking.com car rental impact check failed: ${error.message}`);
      }
    }

    const logs: DecisionLogEntry[] = [];

    // 1️⃣ 标记问题
    const overloadedDays = dayProfiles.filter(d => d.fatigueIndex > 1.1);
    const severeDays = dayProfiles.filter(d => d.fatigueIndex > 1.4);

    const rollingIssues = this.detectRollingFatigue(dayProfiles, pace);

    const ops: DrDreOperation[] = [];

    // 2️⃣ 先处理严重天（必须拆）
    for (const day of severeDays) {
      const op = this.planSplitDay(day, dayProfiles, pace);
      if (op) {
        ops.push(op);
      }
    }

    // 3️⃣ 再看 rolling 疲劳（如果还有）
    if (rollingIssues.length) {
      const op = this.planBufferDay(rollingIssues, dayProfiles, pace, world.human);
      if (op) {
        ops.push(op);
      }
    }

    // 4️⃣ 处理偏紧张的天（可选优化）
    if (ops.length === 0 && overloadedDays.length > 0) {
      // 如果还有偏紧张的天，尝试拆分
      for (const day of overloadedDays) {
        const op = this.planSplitDay(day, dayProfiles, pace);
        if (op) {
          ops.push(op);
          break; // 一次只处理一个，避免过度调整
        }
      }
    }

    if (!ops.length) {
      return {
        allowed: true,
        action: 'ALLOW',
        updatedPlan: plan,
        logs: [
          {
            persona: 'DR_DRE',
            action: 'ALLOW',
            explanation: '日节奏与连续疲劳均在可接受范围内，无需结构调整',
            reasonCodes: [],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'HUMAN',
            decisionStage: 'PACE_ADJUST',
          },
        ],
      };
    }

    // 5️⃣ 应用操作（可以一条条应用，也可以限制数量）
    let updatedPlan = { ...plan };
    for (const op of ops) {
      updatedPlan = this.applyOp(updatedPlan, op);
      logs.push({
        persona: 'DR_DRE',
        action: 'ADJUST',
        explanation: this.describeOp(op),
        reasonCodes: [op.type],
        evidenceRefs: [],
        timestamp: new Date().toISOString(),
        decisionSource: 'HUMAN',
        decisionStage: 'PACE_ADJUST',
      });
    }

    this.logger.debug(`Dr.Dre 评估完成: ADJUST, 操作数: ${ops.length}`);

    return {
      allowed: true,
      action: 'ADJUST',
      updatedPlan,
      logs,
    };
  }

  /**
   * 构建节奏约束
   * 
   * 第一性原理：完全以 HumanCapabilityModel 驱动
   * 
   * 从 world.human + routeDirection.softConstraints 生成 PaceConstraints
   * 不再使用"魔法参数"，所有阈值都来自人体能力模型
   */
  private buildPaceConstraints(world: WorldModelContext): PaceConstraints {
    const human = world.human;
    const routeDirection = world.routeDirection;
    const softConstraints = routeDirection.constraints?.soft || {};

    // 单日最大爬升：取 human 和 routeDirection 软约束的较小值
    const maxDailyAscentM = Math.min(
      human.maxDailyAscentM,
      softConstraints.maxDailyAscentM || Infinity
    );

    // 连续 3 天滚动爬升：直接使用 human 的值
    const rollingAscent3DaysM = human.rollingAscent3DaysM;

    // 单日最大距离：根据节奏偏好调整
    // 慢节奏用户：16-18km，中等：20-22km，快节奏：24-26km
    let maxDailyDistanceKm = 22; // 默认中等
    if (human.preferredPace === 'SLOW') {
      maxDailyDistanceKm = human.bufferDayBias === 'HIGH' ? 16 : 18;
    } else if (human.preferredPace === 'FAST') {
      maxDailyDistanceKm = 24;
    } else {
      maxDailyDistanceKm = 22;
    }

    // 最大移动时间：根据节奏偏好调整
    // 慢节奏：7-8 小时，中等：9 小时，快节奏：10-11 小时
    let maxMovingHours = 9; // 默认中等
    if (human.preferredPace === 'SLOW') {
      maxMovingHours = 7;
    } else if (human.preferredPace === 'FAST') {
      maxMovingHours = 10;
    }

    return {
      maxDailyAscentM,
      maxDailyDistanceKm,
      maxMovingHours,
      rollingAscent3DaysM,
    };
  }

  /**
   * 构建每日画像
   */
  private buildDayProfiles(
    plan: RoutePlanDraft,
    pace: PaceConstraints
  ): DayProfile[] {
    const daysMap = new Map<number, RouteSegment[]>();
    for (const seg of plan.segments) {
      const list = daysMap.get(seg.dayIndex) ?? [];
      list.push(seg);
      daysMap.set(seg.dayIndex, list);
    }

    return Array.from(daysMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([dayIndex, segments]) => {
        const totalDistanceKm = segments.reduce((s, seg) => s + seg.distanceKm, 0);
        const totalAscentM = segments.reduce((s, seg) => s + seg.ascentM, 0);
        const maxSlopePct = segments.reduce(
          (m, seg) => Math.max(m, seg.slopePct ?? 0),
          0
        );
        // 粗略估算移动时间
        const estMovingHours = this.fatigueCalculator.estimateMovingHours(
          totalDistanceKm,
          totalAscentM
        );

        const dp: DayProfile = {
          dayIndex,
          segments,
          totalDistanceKm,
          totalAscentM,
          maxSlopePct,
          estMovingHours,
          fatigueIndex: 0, // 先占位，之后统一算
        };

        dp.fatigueIndex = this.fatigueCalculator.computeFatigueIndex(dp, pace);
        return dp;
      });
  }

  /**
   * 检测滚动疲劳
   */
  private detectRollingFatigue(
    days: DayProfile[],
    pace: PaceConstraints
  ): RollingFatigueIssue[] {
    const issues: RollingFatigueIssue[] = [];
    for (let i = 0; i < days.length - 2; i++) {
      const window = days.slice(i, i + 3);
      const total = window.reduce((s, d) => s + d.totalAscentM, 0);
      if (total > pace.rollingAscent3DaysM) {
        issues.push({
          startDay: window[0].dayIndex,
          endDay: window[2].dayIndex,
          totalAscent: total,
        });
      }
    }
    return issues;
  }

  /**
   * 规划拆天操作
   */
  private planSplitDay(
    day: DayProfile,
    allDays: DayProfile[],
    pace: PaceConstraints
  ): SplitOperation | null {
    const segs = day.segments;
    if (segs.length <= 1) {
      // 只有一段路，很难拆，只能交给 Buffer Day
      return null;
    }

    // 遍历所有可能的拆分点
    let best: { idx: number; score: number } | null = null;

    for (let i = 0; i < segs.length - 1; i++) {
      const firstSegs = segs.slice(0, i + 1);
      const secondSegs = segs.slice(i + 1);

      const firstProfile = this.buildDayProfileFromSegments(
        day.dayIndex,
        firstSegs,
        pace
      );
      const secondProfile = this.buildDayProfileFromSegments(
        day.dayIndex + 1, // 拆成第二天
        secondSegs,
        pace
      );

      const maxFatigue = Math.max(
        firstProfile.fatigueIndex,
        secondProfile.fatigueIndex
      );

      const score = 1 / maxFatigue; // 越低越糟，反过来

      if (!best || score > best.score) {
        best = { idx: i, score };
      }
    }

    if (!best) {
      return null;
    }

    // 给定一个阈值：拆完之后 maxFatigue 不能 > 1.4
    if (1 / best.score > 1.4) {
      return null;
    }

    return {
      type: 'SPLIT_DAY',
      dayIndex: day.dayIndex,
      splitAfterSegmentIndex: best.idx,
    };
  }

  /**
   * 从 segments 构建 DayProfile
   */
  private buildDayProfileFromSegments(
    dayIndex: number,
    segments: RouteSegment[],
    pace: PaceConstraints
  ): DayProfile {
    const totalDistanceKm = segments.reduce((s, seg) => s + seg.distanceKm, 0);
    const totalAscentM = segments.reduce((s, seg) => s + seg.ascentM, 0);
    const maxSlopePct = segments.reduce(
      (m, seg) => Math.max(m, seg.slopePct ?? 0),
      0
    );
    const estMovingHours = this.fatigueCalculator.estimateMovingHours(
      totalDistanceKm,
      totalAscentM
    );

    const dp: DayProfile = {
      dayIndex,
      segments,
      totalDistanceKm,
      totalAscentM,
      maxSlopePct,
      estMovingHours,
      fatigueIndex: 0,
    };
    dp.fatigueIndex = this.fatigueCalculator.computeFatigueIndex(dp, pace);
    return dp;
  }

  /**
   * 规划缓冲日操作
   * 
   * 第一性原理：基于 HumanCapabilityModel 的 bufferDayBias 决定是否插入
   */
  private planBufferDay(
    rollingIssues: RollingFatigueIssue[],
    days: DayProfile[],
    pace: PaceConstraints,
    human?: import('../models/human-capability.model').HumanCapabilityModel
  ): BufferDayOperation | null {
    // 如果用户明确不希望缓冲日（bufferDayBias === 'LOW'），且滚动疲劳不严重，可以不插
    if (human?.bufferDayBias === 'LOW') {
      // 只有在滚动爬升严重超过阈值时才插入
      const issue = rollingIssues[0];
      const threshold = pace.rollingAscent3DaysM * 1.2; // 超过 20% 才插入
      if (issue.totalAscent < threshold) {
        return null;
      }
    }

    // 拿第一条问题 window
    const issue = rollingIssues[0];
    // 找这个 window 中 fatigueIndex 最大的 day
    const windowDays = days.filter(
      d => d.dayIndex >= issue.startDay && d.dayIndex <= issue.endDay
    );
    if (!windowDays.length) {
      return null;
    }

    const worst = windowDays.reduce((max, d) =>
      d.fatigueIndex > max.fatigueIndex ? d : max
    );

    // 根据 bufferDayBias 选择模板
    let template: 'REST' | 'LIGHT_WALK' | 'LOCAL_EXPLORE' = 'REST';
    if (human?.bufferDayBias === 'LOW') {
      template = 'LIGHT_WALK'; // 低缓冲偏好：轻度活动而不是完全休息
    } else if (human?.bufferDayBias === 'HIGH') {
      template = 'REST'; // 高缓冲偏好：完全休息
    }

    return {
      type: 'INSERT_BUFFER_DAY',
      insertAfterDayIndex: worst.dayIndex,
      template,
    };
  }

  /**
   * 应用操作
   */
  private applyOp(plan: RoutePlanDraft, op: DrDreOperation): RoutePlanDraft {
    if (op.type === 'SPLIT_DAY') {
      return this.applySplit(plan, op);
    }
    if (op.type === 'INSERT_BUFFER_DAY') {
      return this.applyBuffer(plan, op);
    }
    return plan;
  }

  /**
   * 应用拆天操作
   */
  private applySplit(plan: RoutePlanDraft, op: SplitOperation): RoutePlanDraft {
    const segs = [...plan.segments];
    const result: RouteSegment[] = [];
    const processedSegments = new Set<string>();

    // 1. 处理拆分前的所有 segments
    for (const seg of segs) {
      if (seg.dayIndex < op.dayIndex) {
        result.push(seg);
        processedSegments.add(seg.segmentId);
      }
    }

    // 2. 处理要拆分的那一天
    const sameDaySegs = segs
      .filter(s => s.dayIndex === op.dayIndex)
      .sort((a, b) => {
        // 保持原有顺序（如果有 segmentIndex 或其他顺序标识）
        return 0;
      });

    if (sameDaySegs.length > 0) {
      const firstPart = sameDaySegs.slice(0, op.splitAfterSegmentIndex + 1);
      const secondPart = sameDaySegs.slice(op.splitAfterSegmentIndex + 1);

      // 第一部分保持原 dayIndex
      for (const s of firstPart) {
        result.push(s);
        processedSegments.add(s.segmentId);
      }

      // 第二部分变成 dayIndex+1
      for (const s of secondPart) {
        result.push({ ...s, dayIndex: s.dayIndex + 1 });
        processedSegments.add(s.segmentId);
      }
    }

    // 3. 处理拆分后的所有 segments（dayIndex +1）
    for (const seg of segs) {
      if (!processedSegments.has(seg.segmentId) && seg.dayIndex > op.dayIndex) {
        result.push({
          ...seg,
          dayIndex: seg.dayIndex + 1,
        });
      }
    }

    return { ...plan, segments: result };
  }

  /**
   * 应用缓冲日操作
   */
  private applyBuffer(plan: RoutePlanDraft, op: BufferDayOperation): RoutePlanDraft {
    const segs = [...plan.segments];
    const result: RouteSegment[] = [];

    for (const seg of segs) {
      if (seg.dayIndex <= op.insertAfterDayIndex) {
        result.push(seg);
      } else {
        // 插入缓冲日后，后面的 dayIndex +1
        result.push({
          ...seg,
          dayIndex: seg.dayIndex + 1,
        });
      }
    }

    // 创建缓冲日占位 segment
    const bufferSegment: RouteSegment = {
      segmentId: `REST_${op.insertAfterDayIndex + 1}_${Date.now()}`,
      dayIndex: op.insertAfterDayIndex + 1,
      distanceKm: 0,
      ascentM: 0,
      slopePct: 0,
      metadata: {
        type: 'REST_DAY',
        template: op.template || 'REST',
      },
    };

    // 插入到正确位置
    const insertIndex = result.findIndex(
      s => s.dayIndex > op.insertAfterDayIndex
    );
    if (insertIndex >= 0) {
      result.splice(insertIndex, 0, bufferSegment);
    } else {
      result.push(bufferSegment);
    }

    return { ...plan, segments: result };
  }

  /**
   * 描述操作
   */
  private describeOp(op: DrDreOperation): string {
    if (op.type === 'SPLIT_DAY') {
      return `将第 ${op.dayIndex} 天拆分为两天，以降低单日负荷`;
    }
    if (op.type === 'INSERT_BUFFER_DAY') {
      return `在第 ${op.insertAfterDayIndex} 天之后插入缓冲日，缓解连续疲劳`;
    }
    return '进行了节奏调整';
  }
}

