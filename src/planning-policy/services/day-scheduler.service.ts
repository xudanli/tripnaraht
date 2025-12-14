// src/planning-policy/services/day-scheduler.service.ts

import { Injectable } from '@nestjs/common';
import { PlanningPolicy } from '../interfaces/planning-policy.interface';
import {
  DayScheduleRequest,
  DayScheduleResult,
  PlannedStop,
} from '../interfaces/scheduler.interface';
import { Poi } from '../interfaces/poi.interface';
import { TransitSegment } from '../interfaces/transit-segment.interface';
import { RestStop } from '../interfaces/rest-stop.interface';
import { DefaultCostModelInstance } from './cost-model.service';
import { HpSimulatorService } from './hp-simulator.service';
import {
  hhmmToMin,
  latestEntryMin,
  calculateDistance,
  isHoliday,
  DayOfWeek,
} from '../utils/time-utils';

/**
 * 时间槽排程器服务
 * 
 * 核心功能：将候选 POI 排成可行的时间轴，自动插入休息点
 */
@Injectable()
export class DaySchedulerService {
  constructor(private hpSimulator: HpSimulatorService) {}

  /**
   * 计算 POI 的效用值（用于排序）
   */
  private poiUtility(
    poi: Poi,
    policy: PlanningPolicy,
    mustSee: boolean
  ): number {
    const w = policy.weights;

    let score = 0;

    // 用 tagAffinity 做"兴趣收益"
    for (const t of poi.tags) {
      score += w.tagAffinity[t] ?? 1.0;
    }

    if (mustSee) {
      score += w.mustSeeBoost * 10;
    }

    // 下雨：室外/天气敏感景点收益下降
    const sens = poi.weatherSensitivity ?? 0;
    if (
      policy.context?.isRaining &&
      sens >= 2 &&
      !poi.tags.includes('indoor')
    ) {
      score *= 0.7;
    }

    return score;
  }

  /**
   * 检查 POI 是否违反硬约束
   */
  private violatesPoiHardConstraints(
    poi: Poi,
    policy: PlanningPolicy
  ): string | null {
    const c = policy.constraints;

    if (c.requireWheelchairAccess && poi.wheelchairAccess === false) {
      return 'POI_NOT_WHEELCHAIR_ACCESSIBLE';
    }

    if (c.forbidStairs && poi.stairsRequired === true) {
      return 'POI_STAIRS_REQUIRED';
    }

    return null;
  }

  /**
   * 检查是否在时间窗口内（支持等待、节假日、多时间段）
   * 
   * 增强功能：
   * - 支持节假日特殊时间
   * - 支持多时间段（一天可能有多个开放窗口）
   * - 支持闭馆日期
   * - 支持按星期几区分的最晚入场时间
   */
  private withinTimeWindow(
    req: DayScheduleRequest,
    arriveMin: number,
    poi: Poi
  ): { ok: boolean; waitMin: number; reason?: string } {
    if (!poi.openingHours) {
      return { ok: true, waitMin: 0 };
    }

    const oh = poi.openingHours;
    const dateISO = req.dateISO;

    // 检查是否在闭馆日期
    if (dateISO && oh.closedDates?.includes(dateISO)) {
      return { ok: false, waitMin: 0, reason: 'CLOSED_DATE' };
    }

    // 收集所有可能的窗口（包括节假日特殊日期）
    const applicableWindows = oh.windows.filter((w) => {
      // 检查节假日特殊日期
      if (w.holidayDates && dateISO) {
        return w.holidayDates.includes(dateISO);
      }

      // 检查是否仅在节假日生效
      if (w.holidaysOnly !== undefined) {
        const isHolidayToday = dateISO ? isHoliday(dateISO) : false;
        if (w.holidaysOnly !== isHolidayToday) {
          return false;
        }
      }

      // 检查星期几匹配
      if (w.dayOfWeek !== undefined) {
        return w.dayOfWeek === req.dayOfWeek;
      }

      // 如果没有设置 dayOfWeek 也没有设置节假日相关，默认适用
      return true;
    });

    if (applicableWindows.length === 0) {
      return { ok: false, waitMin: 0, reason: 'NO_OPEN_WINDOW' };
    }

    // 找到包含到达时间的窗口
    const inWindow = applicableWindows.find(
      (w) =>
        arriveMin >= hhmmToMin(w.start) && arriveMin <= hhmmToMin(w.end)
    );

    if (inWindow) {
      const lastEntry = latestEntryMin(oh, req.dayOfWeek);
      if (lastEntry !== undefined && arriveMin > lastEntry) {
        return { ok: false, waitMin: 0, reason: 'PAST_LAST_ENTRY' };
      }
      return { ok: true, waitMin: 0 };
    }

    // 找下一个窗口开始时间（可能在当天，也可能在第二天）
    const todayStartTimes = applicableWindows
      .map((w) => hhmmToMin(w.start))
      .filter((s) => s > arriveMin)
      .sort((a, b) => a - b);

    if (todayStartTimes.length > 0) {
      return { ok: true, waitMin: todayStartTimes[0] - arriveMin };
    }

    // 当天没有可用窗口了
    return { ok: false, waitMin: 0, reason: 'CLOSED_REST_OF_DAY' };
  }

  /**
   * 选择最佳休息点
   * 
   * 多条件评分：
   * - 距离：越近越好（直线距离）
   * - 可达性：轮椅可达、无障碍设施
   * - 舒适度：座位、厕所、室内/室外
   * - 休息收益：回血值、舒适分
   * 
   * 评分公式：综合分 = 舒适分 × 可达性系数 × 距离系数 + 休息收益
   */
  private pickBestRestStop(args: {
    policy: PlanningPolicy;
    from: { lat: number; lng: number };
    restStops: RestStop[];
  }): RestStop | null {
    const { policy, from, restStops } = args;

    if (restStops.length === 0) return null;

    // 过滤：根据硬约束过滤不可达的休息点
    const feasible = restStops.filter((rest) => {
      const c = policy.constraints;

      // 轮椅可达约束
      if (c.requireWheelchairAccess && rest.wheelchairAccess === false) {
        return false;
      }

      return true;
    });

    if (feasible.length === 0) {
      // 如果没有可达的，返回原始的（避免无解）
      return restStops[0];
    }

    // 计算每个休息点的综合得分
    const scored = feasible.map((rest) => {
      // 1. 距离分数（0-1，越近越高）
      const distanceM = calculateDistance(
        from.lat,
        from.lng,
        rest.lat,
        rest.lng
      );
      const distanceKm = distanceM / 1000;

      // 距离系数：500米内满分，2公里内线性衰减，超过2公里大幅衰减
      let distanceScore = 1.0;
      if (distanceKm <= 0.5) {
        distanceScore = 1.0;
      } else if (distanceKm <= 2.0) {
        distanceScore = 1.0 - (distanceKm - 0.5) / 1.5 * 0.5; // 0.5-1.0
      } else {
        distanceScore = Math.max(0.3, 0.5 - (distanceKm - 2.0) * 0.1); // 最低 0.3
      }

      // 2. 可达性系数（基于约束）
      let accessibilityScore = 1.0;
      if (policy.constraints.requireWheelchairAccess) {
        if (rest.wheelchairAccess) {
          accessibilityScore = 1.2; // 轮椅可达有加成
        } else {
          accessibilityScore = 0; // 不可达（已在过滤中处理，但保险起见）
        }
      }

      // 3. 设施加分
      let facilitiesBonus = 0;
      if (rest.restroomNearby) {
        facilitiesBonus += 0.15; // 有厕所
      }
      if (rest.seatingAvailable) {
        facilitiesBonus += 0.15; // 有座位
      }
      if (rest.tags.includes('indoor')) {
        facilitiesBonus += 0.1; // 室内（不受天气影响）
      }
      if (rest.tags.includes('cafe') || rest.tags.includes('mall')) {
        facilitiesBonus += 0.1; // 咖啡馆/商场通常更舒适
      }

      // 4. 基础舒适分（归一化到 0-1）
      const comfortBase = Math.min(rest.restBenefit.comfortScore / 10, 1.0);

      // 5. 休息收益（回血量，归一化）
      const regenBonus = Math.min(rest.restBenefit.regenHp / 20, 0.2); // 最多加 0.2

      // 综合得分
      const totalScore =
        (comfortBase + facilitiesBonus) *
        accessibilityScore *
        distanceScore +
        regenBonus;

      return {
        rest,
        score: totalScore,
        distanceKm,
        details: {
          comfortBase,
          facilitiesBonus,
          accessibilityScore,
          distanceScore,
          regenBonus,
        },
      };
    });

    // 排序并返回得分最高的
    scored.sort((a, b) => b.score - a.score);

    return scored[0].rest;
  }

  /**
   * 排程一天
   * 
   * 核心算法：贪心 + 可行性检查 + 自动插入休息
   * 
   * 原则：先保证可行与稳定，再逐步变聪明
   */
  async scheduleDay(
    policy: PlanningPolicy,
    req: DayScheduleRequest
  ): Promise<DayScheduleResult> {
    const bufferMin = req.bufferMin ?? 10;
    const stops: PlannedStop[] = [];

    let nowMin = req.startMin;
    let loc = req.startLocation;

    // 统计指标
    let totalTravelMin = 0;
    let totalWalkMin = 0;
    let totalTransfers = 0;
    let totalQueueMin = 0;

    // HP 初始
    let hpState = {
      hp: policy.pacing.hpMax,
      lastRestAtMin: req.startMin,
      lastBreakAtMin: req.startMin,
    };

    // 先过滤硬不可行 POI
    const remaining = req.pois.filter(
      (p) => !this.violatesPoiHardConstraints(p, policy)
    );

    const mustSee = new Set(req.mustSeePoiIds ?? []);

    // 主循环：不断选择下一个 POI 或插入休息
    while (nowMin < req.endMin - 30) {
      // 1) 是否需要休息
      if (
        this.hpSimulator.restNeeded(
          policy,
          hpState.hp,
          nowMin,
          hpState
        )
      ) {
        const rest = this.pickBestRestStop({
          policy,
          from: loc,
          restStops: req.restStops,
        });

        if (!rest) break;

        // 到休息点的交通（可选：如果 rest 就在附近可走过去）
        const segs = await req.getTransit(
          loc,
          { lat: rest.lat, lng: rest.lng },
          policy
        );

        const bestSeg = segs
          .sort(
            (a, b) =>
              DefaultCostModelInstance.edgeCost({ segment: a, policy }) -
              DefaultCostModelInstance.edgeCost({ segment: b, policy })
          )[0];

        if (!bestSeg) break;

        // 统计
        totalTravelMin += bestSeg.durationMin;
        totalWalkMin += bestSeg.walkMin;
        totalTransfers += bestSeg.transferCount;

        // 体力消耗
        hpState = this.hpSimulator.applyTravelFatigue({
          policy,
          hpState,
          travel: {
            walkMin: bestSeg.walkMin,
            stairsCount: bestSeg.stairsCount ?? 0,
          },
          nowMin,
        });

        nowMin += bestSeg.durationMin;

        // 休息本体
        const restMin = rest.restBenefit.recommendedMin;

        if (nowMin + restMin > req.endMin) break;

        const start = nowMin;
        nowMin += restMin;

        hpState = this.hpSimulator.applyRestRecovery({
          policy,
          hpState,
          restMin,
          nowMin,
          restBenefitHp: rest.restBenefit.regenHp,
        });

        stops.push({
          kind: 'REST',
          id: rest.id,
          name: `休息｜${rest.name}`,
          startMin: start,
          endMin: nowMin,
          lat: rest.lat,
          lng: rest.lng,
          transitIn: bestSeg,
          notes: ['根据体力/强制休息间隔自动插入休息点'],
        });

        loc = { lat: rest.lat, lng: rest.lng };
        continue;
      }

      // 2) 选择一个"可行且收益最高"的 POI
      let bestChoice: {
        poi: Poi;
        seg: TransitSegment;
        gain: number;
        waitMin: number;
      } | null = null;

      for (const poi of remaining) {
        // 简化：候选多时可先取 topK（按兴趣分）再评估交通
        const segs = await req.getTransit(
          loc,
          { lat: poi.lat, lng: poi.lng },
          policy
        );

        if (!segs || segs.length === 0) continue;

        // 选择对该画像代价最低的交通段
        const seg = segs
          .filter(
            (s) =>
              DefaultCostModelInstance.edgeCost({ segment: s, policy }) !==
              Number.POSITIVE_INFINITY
          )
          .sort(
            (a, b) =>
              DefaultCostModelInstance.edgeCost({ segment: a, policy }) -
              DefaultCostModelInstance.edgeCost({ segment: b, policy })
          )[0];

        if (!seg) continue;

        const arriveMin = nowMin + seg.durationMin;

        // 连续步行 / 单段步行约束
        if (seg.walkMin > policy.constraints.maxSingleWalkMin) continue;

        // 开放时间检查（允许等待）
        const tw = this.withinTimeWindow(req, arriveMin, poi);
        if (!tw.ok) continue;

        const waitMin = tw.waitMin;
        const startVisitMin = arriveMin + waitMin;
        const visitMin = poi.avgVisitMin;
        const endVisitMin = startVisitMin + visitMin + bufferMin;

        // 日程结束边界
        if (endVisitMin > req.endMin) continue;

        // 收益 = 兴趣收益 - 交通代价 - 等待惩罚 - 疲劳惩罚
        const interest = this.poiUtility(poi, policy, mustSee.has(poi.id));
        const travelCost = DefaultCostModelInstance.edgeCost({
          segment: seg,
          policy,
        });
        const waitPenalty =
          waitMin * policy.weights.overtimePenaltyPerMin * 0.4; // 等待不如超时那么痛

        // 疲劳惩罚：走得越多、越接近低HP越罚
        const fatiguePenalty =
          seg.walkMin *
          policy.weights.walkPainPerMin *
          (hpState.hp < 25 ? 1.25 : 1.0);

        const gain = interest * 10 - travelCost - waitPenalty - fatiguePenalty;

        if (!bestChoice || gain > bestChoice.gain) {
          bestChoice = { poi, seg, gain, waitMin };
        }
      }

      // 3) 如果找不到可行 POI：尝试插入休息或结束
      if (!bestChoice) {
        const rest = this.pickBestRestStop({
          policy,
          from: loc,
          restStops: req.restStops,
        });

        if (!rest) break;

        const shortRestMin = Math.min(20, rest.restBenefit.minMin);

        if (nowMin + shortRestMin > req.endMin) break;

        const start = nowMin;
        nowMin += shortRestMin;

        hpState = this.hpSimulator.applyRestRecovery({
          policy,
          hpState,
          restMin: shortRestMin,
          nowMin,
          restBenefitHp: 0,
        });

        stops.push({
          kind: 'REST',
          id: rest.id,
          name: `短休｜${rest.name}`,
          startMin: start,
          endMin: nowMin,
          lat: loc.lat,
          lng: loc.lng,
          notes: ['无可行景点时插入短休，保证节奏与可行性'],
        });

        continue;
      }

      // 4) 落地该 POI：记录交通 + 等待 + 游玩
      const { poi, seg, waitMin } = bestChoice;

      // 交通统计
      totalTravelMin += seg.durationMin;
      totalWalkMin += seg.walkMin;
      totalTransfers += seg.transferCount;

      // 体力消耗（步行+楼梯）
      hpState = this.hpSimulator.applyTravelFatigue({
        policy,
        hpState,
        travel: {
          walkMin: seg.walkMin,
          stairsCount: seg.stairsCount ?? 0,
        },
        nowMin,
      });

      const arrive = nowMin + seg.durationMin;

      // 等待（如果没开门）
      if (waitMin > 0) {
        totalQueueMin += waitMin;

        hpState = this.hpSimulator.applyTravelFatigue({
          policy,
          hpState,
          travel: { walkMin: 0, queueMin: waitMin },
          nowMin: arrive,
        });
      }

      const visitStart = arrive + waitMin;
      const visitEnd = visitStart + poi.avgVisitMin;

      stops.push({
        kind: 'POI',
        id: poi.id,
        name: poi.name,
        startMin: visitStart,
        endMin: visitEnd,
        lat: poi.lat,
        lng: poi.lng,
        transitIn: seg,
        notes: [
          mustSee.has(poi.id) ? '必去景点加权' : '按兴趣权重选择',
          waitMin > 0 ? `因未开门等待 ${waitMin} 分钟` : '到达即入场',
        ].filter(Boolean),
      });

      // 缓冲（走出景点/上厕所/买水）
      nowMin = visitEnd + bufferMin;
      loc = { lat: poi.lat, lng: poi.lng };

      // 从候选移除
      const idx = remaining.findIndex((p) => p.id === poi.id);
      if (idx >= 0) remaining.splice(idx, 1);

      // 如果 HP 已经见底，直接强制休息一次
      if (hpState.hp <= 8) {
        const rest = this.pickBestRestStop({
          policy,
          from: loc,
          restStops: req.restStops,
        });

        if (!rest) break;

        const restMin = Math.min(30, rest.restBenefit.recommendedMin);

        if (nowMin + restMin > req.endMin) break;

        const start = nowMin;
        nowMin += restMin;

        hpState = this.hpSimulator.applyRestRecovery({
          policy,
          hpState,
          restMin,
          nowMin,
          restBenefitHp: rest.restBenefit.regenHp,
        });

        stops.push({
          kind: 'REST',
          id: rest.id,
          name: `强制休息｜${rest.name}`,
          startMin: start,
          endMin: nowMin,
          lat: loc.lat,
          lng: loc.lng,
          notes: ['HP 过低触发强制休息（防止行程崩盘）'],
        });
      }
    }

    const overtimeMin = Math.max(0, nowMin - req.endMin);

    return {
      stops,
      metrics: {
        totalTravelMin,
        totalWalkMin,
        totalTransfers,
        totalQueueMin,
        overtimeMin,
        hpEnd: Math.round(hpState.hp),
      },
    };
  }
}
