// src/planning-policy/services/replanner.service.ts

import { Injectable } from '@nestjs/common';
import { PlanningPolicy } from '../interfaces/planning-policy.interface';
import {
  ReplanRequest,
  ReplanResult,
  ReplanEvent,
  ChangeBudget,
  StructuredExplanation,
  ChangeReason,
  ChangeImpact,
} from '../interfaces/replanner.interface';
import {
  DayScheduleRequest,
  DayScheduleResult,
  PlannedStop,
} from '../interfaces/scheduler.interface';
import { Poi } from '../interfaces/poi.interface';
import { DefaultCostModelInstance } from './cost-model.service';
import { DaySchedulerService } from './day-scheduler.service';

/**
 * 最小扰动动态重排服务
 * 
 * 核心功能：冻结已发生/即将发生的部分，只重排剩余行程
 */
@Injectable()
export class ReplannerService {
  constructor(private dayScheduler: DaySchedulerService) {}

  /**
   * 冻结前缀（已结束、正在进行的、锁定窗口内的）
   */
  private freezePrefix(
    previousStops: PlannedStop[],
    nowMin: number,
    lockWindowMin: number
  ): {
    frozen: PlannedStop[];
    remainingPrev: PlannedStop[];
  } {
    const frozen: PlannedStop[] = [];
    const remainingPrev: PlannedStop[] = [];

    for (const s of previousStops) {
      const isPast = s.endMin <= nowMin;
      const isOngoing = s.startMin <= nowMin && nowMin < s.endMin;
      const isWithinLock =
        s.startMin >= nowMin && s.startMin <= nowMin + lockWindowMin;

      if (isPast || isOngoing || isWithinLock) {
        frozen.push(s);
      } else {
        remainingPrev.push(s);
      }
    }

    return { frozen, remainingPrev };
  }

  /**
   * 将事件注入到 policy（更新权重和上下文）
   */
  private applyEventToPolicy(
    policy: PlanningPolicy,
    event: ReplanEvent
  ): PlanningPolicy {
    // 注意：尽量不 mutate 原对象（避免并发问题）
    const next: PlanningPolicy = JSON.parse(JSON.stringify(policy));

    if (event.type === 'WEATHER_CHANGED') {
      next.context.isRaining = event.isRaining;
      // 下雨时进一步加大步行惩罚
      next.weights.rainWalkMultiplier = event.isRaining
        ? Math.max(next.weights.rainWalkMultiplier, 2.2)
        : 1.0;
    }

    if (event.type === 'TRAFFIC_DISRUPTION') {
      // 严重拥堵时，提高时间成本
      const mul =
        event.severity === 3 ? 1.25 : event.severity === 2 ? 1.12 : 1.06;
      next.weights.valueOfTimePerMin *= mul;
    }

    // USER_EDIT：稳定性可暂时降低（用户主动改就别再"惩罚改动"太狠）
    if (event.type === 'USER_EDIT') {
      next.weights.planChangePenalty *= 0.7;
    }

    return next;
  }

  /**
   * 构建 POI ban list（事件导致不可用的 POI）
   */
  private buildPoiBanList(
    event: ReplanEvent,
    nowMin: number
  ): Set<string> {
    const banned = new Set<string>();

    if (event.type === 'POI_CLOSED') {
      const eff = event.effectiveFromMin ?? nowMin;
      if (nowMin >= eff) {
        banned.add(event.poiId);
      }
    }

    if (event.type === 'USER_EDIT') {
      for (const id of event.removedStopIds ?? []) {
        banned.add(id);
      }
    }

    return banned;
  }

  /**
   * 从剩余计划提取 POI 顺序（保序是最小扰动的关键）
   */
  private extractRemainingPoiOrder(remainingPrev: PlannedStop[]): string[] {
    return remainingPrev.filter((s) => s.kind === 'POI').map((s) => s.id);
  }

  /**
   * 组装候选 POI 列表（优先保留原顺序）
   */
  private buildCandidatePoiLists(args: {
    originalOrder: string[];
    poiPool: Poi[];
    bannedPoiIds: Set<string>;
    pinnedPoiIds: string[];
  }): Poi[][] {
    const { originalOrder, poiPool, bannedPoiIds, pinnedPoiIds } = args;

    const byId = new Map(poiPool.map((p) => [p.id, p]));

    const pinned = pinnedPoiIds
      .filter((id) => !bannedPoiIds.has(id))
      .map((id) => byId.get(id))
      .filter(Boolean) as Poi[];

    const original = originalOrder
      .filter((id) => !bannedPoiIds.has(id))
      .map((id) => byId.get(id))
      .filter(Boolean) as Poi[];

    // 剩余候选（排除 pinned/original）
    const used = new Set([
      ...pinned.map((p) => p.id),
      ...original.map((p) => p.id),
    ]);
    const extras = poiPool.filter(
      (p) => !bannedPoiIds.has(p.id) && !used.has(p.id)
    );

    // 候选策略 1：严格保序（最小扰动）
    const list1 = [...pinned, ...original, ...extras];

    // 候选策略 2：保序 + 只补少量 extras（更保守）
    const list2 = [...pinned, ...original, ...extras.slice(0, 10)];

    // 候选策略 3：pinned 优先 + extras（当原计划大面积不可行时）
    const list3 = [...pinned, ...extras];

    return [list1, list2, list3];
  }

  /**
   * 计算站点差异
   */
  private diffStops(
    prevRemaining: PlannedStop[],
    newRemaining: PlannedStop[]
  ): ReplanResult['diff'] {
    const prevIds = prevRemaining
      .filter((s) => s.kind === 'POI')
      .map((s) => s.id);
    const newIds = newRemaining
      .filter((s) => s.kind === 'POI')
      .map((s) => s.id);

    const prevSet = new Set(prevIds);
    const newSet = new Set(newIds);

    const kept = prevIds.filter((id) => newSet.has(id));
    const removed = prevIds.filter((id) => !newSet.has(id));
    const added = newIds.filter((id) => !prevSet.has(id));

    // moved：同一个 POI 但开始时间变化较大（> 45min）
    const prevTime = new Map(
      prevRemaining
        .filter((s) => s.kind === 'POI')
        .map((s) => [s.id, s.startMin])
    );
    const moved = newRemaining
      .filter((s) => s.kind === 'POI' && prevTime.has(s.id))
      .filter(
        (s) =>
          Math.abs((prevTime.get(s.id) ?? s.startMin) - s.startMin) >= 45
      )
      .map((s) => s.id);

    const changeCount = removed.length + added.length + moved.length;

    return {
      keptStopIds: kept,
      removedStopIds: removed,
      addedStopIds: added,
      movedStopIds: moved,
      changeCount,
    };
  }

  /**
   * 最小扰动重排剩余行程
   */
  async replanRemaining(
    basePolicy: PlanningPolicy,
    req: ReplanRequest
  ): Promise<ReplanResult> {
    const lockWindowMin = req.lockWindowMin ?? 30;

    // 1) 冻结前缀
    const { frozen, remainingPrev } = this.freezePrefix(
      req.previous.stops,
      req.nowMin,
      lockWindowMin
    );

    // 2) 事件注入到 policy
    const policy = this.applyEventToPolicy(basePolicy, req.event);

    // 3) banlist（闭馆、用户删除等）
    const bannedPoiIds = this.buildPoiBanList(req.event, req.nowMin);

    // pinned 合并
    const pinned = new Set([
      ...(req.pinnedPoiIds ?? []),
      ...((req.event.type === 'USER_EDIT'
        ? req.event.pinnedStopIds
        : []) ?? []),
    ]);
    const pinnedPoiIds = Array.from(pinned);

    // 4) 以"原剩余 POI 顺序"为第一优先
    const originalOrder = this.extractRemainingPoiOrder(remainingPrev);

    // 5) 生成多个候选 POI 列表
    const poiLists = this.buildCandidatePoiLists({
      originalOrder,
      poiPool: req.poiPool,
      bannedPoiIds,
      pinnedPoiIds,
    });

    // 6) 计算新的起点
    const lastFrozen =
      frozen.length > 0 ? frozen[frozen.length - 1] : null;
    const startLoc = lastFrozen
      ? { lat: lastFrozen.lat, lng: lastFrozen.lng }
      : req.currentLocation;
    const startMin = Math.max(
      req.nowMin,
      lastFrozen?.endMin ?? req.nowMin
    );

    // 7) 对每个候选列表跑一次 scheduleDay
    let best: {
      plan: DayScheduleResult;
      diff: ReplanResult['diff'];
      score: number;
      explain: string[];
      structuredExplain: StructuredExplanation[];
    } | null = null;

    for (const candidatePois of poiLists) {
      const dayReq: DayScheduleRequest = {
        dateISO: 'N/A',
        dayOfWeek: req.dayOfWeek,
        startMin,
        endMin: req.endMin,
        startLocation: startLoc,
        pois: candidatePois,
        restStops: req.restStops,
        getTransit: req.getTransit,
        mustSeePoiIds: pinnedPoiIds, // pinned 当作 must-see
        bufferMin: 10,
      };

      const plannedRemaining = await this.dayScheduler.scheduleDay(
        policy,
        dayReq
      );

      // 8) 合并冻结前缀 + 新的剩余
      const mergedStops = [...frozen, ...plannedRemaining.stops];

      // 9) 评估改动
      const d = this.diffStops(remainingPrev, plannedRemaining.stops);

      // 检查变更预算
      const budget = req.changeBudget ?? {
        maxChangeCount: 3,
        maxTimeShiftMin: 60,
        allowAddNewPoi: false,
        allowRemoveMustSee: false,
      };

      // 变更预算检查
      if (budget.maxChangeCount !== undefined && d.changeCount > budget.maxChangeCount) {
        continue; // 超出预算，跳过此候选
      }

      if (!budget.allowAddNewPoi && d.addedStopIds.length > 0) {
        continue; // 不允许新增 POI
      }

      // 检查时间移动（简化：检查 moved 的最大时间差）
      const maxTimeShift = this.calculateMaxTimeShift(remainingPrev, plannedRemaining.stops);
      if (budget.maxTimeShiftMin !== undefined && maxTimeShift > budget.maxTimeShiftMin) {
        continue; // 超出时间移动预算
      }

      // 10) 评估分数：总代价 + 改动惩罚
      const score = DefaultCostModelInstance.itineraryCost(
        {
          totalTravelMin: plannedRemaining.metrics.totalTravelMin,
          totalWalkMin: plannedRemaining.metrics.totalWalkMin,
          totalTransfers: plannedRemaining.metrics.totalTransfers,
          totalQueueMin: plannedRemaining.metrics.totalQueueMin,
          overtimeMin: plannedRemaining.metrics.overtimeMin,
          totalStairsCount: 0,
          planChangeCount: d.changeCount,
        },
        policy
      );

      const explain: string[] = [];
      explain.push(
        `冻结已发生/锁定窗口内行程（锁定 ${lockWindowMin} 分钟），仅重排剩余部分`
      );

      if (req.event.type === 'WEATHER_CHANGED') {
        explain.push(
          req.event.isRaining
            ? '检测到下雨：降低步行与室外优先级'
            : '天气转好：恢复步行可用性'
        );
      }

      if (req.event.type === 'POI_CLOSED') {
        explain.push(`景点闭馆：移除 ${req.event.poiId}`);
      }

      if (req.event.type === 'CROWD_SPIKE') {
        explain.push(
          `拥挤上升：降低 ${req.event.poiId} 的优先级（可用排队模型进一步细化）`
        );
      }

      if (pinnedPoiIds.length) {
        explain.push(`保留用户钉住/必去：${pinnedPoiIds.join(', ')}`);
      }

      // 生成结构化解释
      const structuredExplain = this.buildStructuredExplanation(
        req.event,
        d,
        req.previous,
        plannedRemaining,
        pinnedPoiIds
      );

      if (!best || score < best.score) {
        best = {
          plan: { stops: mergedStops, metrics: plannedRemaining.metrics },
          diff: d,
          score,
          explain,
          structuredExplain,
        };
      }
    }

    // 兜底：若全失败，至少返回冻结段
    if (!best) {
      return {
        merged: {
          stops: frozen,
          metrics: {
            totalTravelMin: 0,
            totalWalkMin: 0,
            totalTransfers: 0,
            totalQueueMin: 0,
            overtimeMin: 0,
            hpEnd: basePolicy.pacing.hpMax,
          },
        },
        diff: {
          keptStopIds: [],
          removedStopIds: [],
          addedStopIds: [],
          movedStopIds: [],
          changeCount: 0,
        },
        explain: [
          '重排失败：候选不足或可达性/时间窗约束过严，仅保留已冻结部分',
        ],
        structuredExplain: [
          {
            reason: 'FEASIBILITY_ISSUE',
            description:
              '重排失败：候选不足或可达性/时间窗约束过严，仅保留已冻结部分',
          },
        ],
        withinBudget: true,
      };
    }

    // 检查是否在预算内
    const budget = req.changeBudget ?? {
      maxChangeCount: 3,
      maxTimeShiftMin: 60,
      allowAddNewPoi: false,
      allowRemoveMustSee: false,
    };

    const withinBudget =
      (budget.maxChangeCount === undefined || best.diff.changeCount <= budget.maxChangeCount) &&
      (budget.allowAddNewPoi || best.diff.addedStopIds.length === 0);

    const maxTimeShift = this.calculateMaxTimeShift(remainingPrev, best.plan.stops.filter(s => !frozen.some(f => f.id === s.id)));

    return {
      merged: best.plan,
      diff: best.diff,
      explain: best.explain,
      structuredExplain: best.structuredExplain,
      withinBudget,
      budgetUsage: {
        changeCount: best.diff.changeCount,
        maxChangeCount: budget.maxChangeCount ?? Infinity,
        maxTimeShiftExceeded: budget.maxTimeShiftMin !== undefined && maxTimeShift > budget.maxTimeShiftMin,
      },
    };
  }

  /**
   * 计算最大时间移动（分钟）
   */
  private calculateMaxTimeShift(
    prevStops: PlannedStop[],
    newStops: PlannedStop[]
  ): number {
    const prevTimeMap = new Map(
      prevStops.filter((s) => s.kind === 'POI').map((s) => [s.id, s.startMin])
    );

    let maxShift = 0;
    for (const s of newStops) {
      if (s.kind === 'POI' && prevTimeMap.has(s.id)) {
        const shift = Math.abs(s.startMin - (prevTimeMap.get(s.id) ?? s.startMin));
        maxShift = Math.max(maxShift, shift);
      }
    }

    return maxShift;
  }

  /**
   * 构建结构化解释
   */
  private buildStructuredExplanation(
    event: ReplanEvent,
    diff: ReplanResult['diff'],
    previous: DayScheduleResult,
    newPlan: DayScheduleResult,
    pinnedPoiIds: string[]
  ): StructuredExplanation[] {
    const explanations: StructuredExplanation[] = [];

    // 根据事件类型构建解释
    let reason: ChangeReason;
    let description: string;
    let impact: ChangeImpact | undefined;

    switch (event.type) {
      case 'WEATHER_CHANGED':
        reason = 'WEATHER_CHANGE';
        description = event.isRaining
          ? '检测到下雨，调整行程以优先室内景点和便捷交通'
          : '天气转好，恢复步行和室外景点的可用性';
        impact = {
          reducedWalkMin: event.isRaining
            ? Math.max(0, previous.metrics.totalWalkMin - newPlan.metrics.totalWalkMin)
            : undefined,
        };
        break;

      case 'POI_CLOSED':
        reason = 'POI_CLOSED';
        description = `景点 ${event.poiId} 临时闭馆，已从行程中移除`;
        impact = {
          savedTimeMin: -30, // 简化：假设节省30分钟（实际应该计算）
        };
        explanations.push({
          reason,
          description,
          impact,
          alternatives: [
            {
              description: '保留原计划',
              keepOriginal: true,
              risk: '可能到达后发现闭馆，需要重新安排',
            },
          ],
        });
        return explanations;

      case 'CROWD_SPIKE':
        reason = 'CROWD_SPIKE';
        description = `景点 ${event.poiId} 拥挤度上升，预计排队时间增加 ${event.queueExtraMin ?? 0} 分钟`;
        impact = {
          improvedOnTimeProb: 5, // 简化：假设提高5%准点概率
        };
        break;

      case 'TRAFFIC_DISRUPTION':
        reason = 'TRAFFIC_DISRUPTION';
        description = `检测到 ${event.area ?? '该区域'} 交通中断，调整路线以避免延误`;
        impact = {
          savedTimeMin: 10, // 简化：假设节省10分钟
          improvedOnTimeProb: 10,
        };
        break;

      case 'USER_EDIT':
        reason = 'USER_EDIT';
        description = '根据您的调整重新优化行程';
        break;

      default:
        reason = 'FEASIBILITY_ISSUE';
        description = '因可行性问题调整行程';
    }

    // 添加变更影响
    if (!impact) {
      impact = {
        reducedWalkMin:
          previous.metrics.totalWalkMin > newPlan.metrics.totalWalkMin
            ? previous.metrics.totalWalkMin - newPlan.metrics.totalWalkMin
            : undefined,
        reducedTransfers:
          previous.metrics.totalTransfers > newPlan.metrics.totalTransfers
            ? previous.metrics.totalTransfers - newPlan.metrics.totalTransfers
            : undefined,
      };
    }

    explanations.push({
      reason,
      description,
      impact,
    });

    // 如果有保留的必去点，添加说明
    if (pinnedPoiIds.length > 0) {
      explanations.push({
        reason: 'USER_EDIT',
        description: `已保留您指定的必去景点：${pinnedPoiIds.join('、')}`,
      });
    }

    return explanations;
  }
}
