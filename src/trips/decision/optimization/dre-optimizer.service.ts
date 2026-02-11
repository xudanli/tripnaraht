// src/trips/decision/optimization/dre-optimizer.service.ts
/**
 * Dr.Dre 优化器服务（Phase 1 升级版）
 * 
 * 从"启发式调整器"升级为"时序约束优化器"
 * 
 * 核心变化：
 * 1. 生成多个候选方案进行比较（而不是贪心调整）
 * 2. 使用目标函数评估每个候选方案
 * 3. 选择期望效用最高的方案
 * 
 * Dr.Dre 的新职责：
 * - 时序优化器（Temporal Optimizer）
 * - 资源调度人格（Resource Scheduler Persona）
 * - 目标：最小化疲劳方差 + 最大化可持续性
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DecisionPersonaStrategy } from '../strategies/decision-persona-strategy.interface';
import { WorldModelContext, RoutePlanDraft, RouteSegment } from '../shared/world-model.types';
import { DecisionResult, DecisionLogEntry } from '../shared/decision-result.types';
import { ObjectiveFunctionService } from './objective-function.service';
import { FatigueCalculatorService } from '../services/fatigue-calculator.service';
import { DayProfile, PaceConstraints } from '../interfaces/day-profile.interface';
import {
  ObjectiveEvaluationResult,
  CandidateComparisonResult,
} from './objective-function.interface';

/**
 * Dre 候选方案类型
 */
export type DreCandidateType =
  | 'ORIGINAL'           // 原始方案
  | 'SPLIT_DAY'          // 拆天方案
  | 'INSERT_BUFFER'      // 插入休息日
  | 'REORDER_SEGMENTS'   // 重排序
  | 'LOAD_BALANCE';      // 负载均衡

/**
 * Dre 候选方案
 */
export interface DreCandidate {
  /** 候选类型 */
  type: DreCandidateType;
  
  /** 候选计划 */
  plan: RoutePlanDraft;
  
  /** 目标函数评估 */
  evaluation: ObjectiveEvaluationResult;
  
  /** 修改描述 */
  modifications: string[];
  
  /** 预计效用提升 */
  utilityImprovement: number;
  
  /** 疲劳指数统计 */
  fatigueStats: {
    mean: number;
    variance: number;
    max: number;
    overloadedDays: number;
  };
}

/**
 * Dre 优化结果
 */
export interface DreOptimizationResult {
  /** 是否需要调整 */
  needsAdjustment: boolean;
  
  /** 推荐的方案 */
  recommendedCandidate: DreCandidate;
  
  /** 所有候选方案 */
  allCandidates: DreCandidate[];
  
  /** 候选方案比较 */
  comparison: CandidateComparisonResult;
  
  /** 决策日志 */
  logs: DecisionLogEntry[];
  
  /** 优化摘要 */
  summary: {
    originalUtility: number;
    optimizedUtility: number;
    improvement: number;
    improvementPct: number;
  };
}

/**
 * Dre 优化配置
 */
export interface DreOptimizationConfig {
  /** 是否生成拆天方案 */
  enableSplitDay?: boolean;
  
  /** 是否生成休息日方案 */
  enableBufferDay?: boolean;
  
  /** 是否生成负载均衡方案 */
  enableLoadBalance?: boolean;
  
  /** 最大候选方案数 */
  maxCandidates?: number;
  
  /** 疲劳阈值（超过则尝试优化） */
  fatigueThreshold?: number;
  
  /** 方差阈值（超过则尝试平衡） */
  varianceThreshold?: number;
}

const DEFAULT_CONFIG: DreOptimizationConfig = {
  enableSplitDay: true,
  enableBufferDay: true,
  enableLoadBalance: true,
  maxCandidates: 5,
  fatigueThreshold: 1.1,
  varianceThreshold: 0.15,
};

@Injectable()
export class DreOptimizerService implements DecisionPersonaStrategy {
  private readonly logger = new Logger(DreOptimizerService.name);
  readonly personaName = 'DR_DRE' as const;

  constructor(
    private readonly objectiveFunction: ObjectiveFunctionService,
    private readonly fatigueCalculator: FatigueCalculatorService,
  ) {}

  /**
   * 评估计划（兼容旧接口）
   */
  async evaluate(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<DecisionResult> {
    const result = await this.optimizeSchedule(plan, world);
    
    if (!result.needsAdjustment) {
      return {
        allowed: true,
        action: 'ALLOW',
        updatedPlan: plan,
        logs: result.logs,
      };
    }
    
    return {
      allowed: true,
      action: 'ADJUST',
      updatedPlan: result.recommendedCandidate.plan,
      logs: result.logs,
    };
  }

  /**
   * 时序优化（Phase 1 核心方法）
   * 
   * 策略：
   * 1. 分析当前计划的疲劳分布
   * 2. 生成多个候选方案
   * 3. 使用目标函数评估每个方案
   * 4. 选择最优方案
   */
  async optimizeSchedule(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    config: DreOptimizationConfig = DEFAULT_CONFIG
  ): Promise<DreOptimizationResult> {
    this.logger.debug(`[Dre] 开始时序优化: ${plan.tripId}`);

    // 1. 分析当前状态
    const pace = this.buildPaceConstraints(world);
    const dayProfiles = this.buildDayProfiles(plan, world, pace);
    const fatigueStats = this.calculateFatigueStats(dayProfiles);
    
    // 2. 评估原始方案
    const originalEvaluation = this.objectiveFunction.evaluate(plan, world);
    const originalCandidate: DreCandidate = {
      type: 'ORIGINAL',
      plan,
      evaluation: originalEvaluation,
      modifications: [],
      utilityImprovement: 0,
      fatigueStats,
    };

    // 3. 判断是否需要优化
    const needsOptimization = this.shouldOptimize(fatigueStats, originalEvaluation, config);
    
    if (!needsOptimization) {
      this.logger.debug(`[Dre] 当前计划无需优化`);
      return {
        needsAdjustment: false,
        recommendedCandidate: originalCandidate,
        allCandidates: [originalCandidate],
        comparison: {
          bestIndex: 0,
          evaluations: [originalEvaluation],
          ranking: [0],
          tradeoffAnalysis: { pairwise: [] },
        },
        logs: this.generateNoChangeLog(fatigueStats),
        summary: {
          originalUtility: originalEvaluation.totalUtility,
          optimizedUtility: originalEvaluation.totalUtility,
          improvement: 0,
          improvementPct: 0,
        },
      };
    }

    // 4. 生成候选方案
    const candidates: DreCandidate[] = [originalCandidate];
    
    if (config.enableSplitDay) {
      const splitCandidates = this.generateSplitDayCandidates(plan, world, dayProfiles, pace);
      candidates.push(...splitCandidates);
    }
    
    if (config.enableBufferDay) {
      const bufferCandidates = this.generateBufferDayCandidates(plan, world, dayProfiles, pace);
      candidates.push(...bufferCandidates);
    }
    
    if (config.enableLoadBalance) {
      const balanceCandidates = this.generateLoadBalanceCandidates(plan, world, dayProfiles, pace);
      candidates.push(...balanceCandidates);
    }

    // 5. 限制候选数量
    const limitedCandidates = candidates.slice(0, config.maxCandidates || 5);

    // 6. 评估所有候选方案
    for (let i = 1; i < limitedCandidates.length; i++) {
      const candidate = limitedCandidates[i];
      candidate.evaluation = this.objectiveFunction.evaluate(candidate.plan, world);
      candidate.utilityImprovement = candidate.evaluation.totalUtility - originalEvaluation.totalUtility;
      
      // 更新疲劳统计
      const candidateDayProfiles = this.buildDayProfiles(candidate.plan, world, pace);
      candidate.fatigueStats = this.calculateFatigueStats(candidateDayProfiles);
    }

    // 7. 比较候选方案
    const comparison = this.objectiveFunction.compareCandidates(
      limitedCandidates.map(c => c.plan),
      world
    );

    // 8. 选择最优方案
    const bestIndex = comparison.bestIndex;
    const recommendedCandidate = limitedCandidates[bestIndex];

    // 9. 生成日志
    const logs = this.generateOptimizationLogs(
      originalCandidate,
      recommendedCandidate,
      limitedCandidates
    );

    // 10. 构建结果
    const improvement = recommendedCandidate.evaluation.totalUtility - originalEvaluation.totalUtility;
    
    return {
      needsAdjustment: bestIndex !== 0 && improvement > 0.01,
      recommendedCandidate,
      allCandidates: limitedCandidates,
      comparison,
      logs,
      summary: {
        originalUtility: originalEvaluation.totalUtility,
        optimizedUtility: recommendedCandidate.evaluation.totalUtility,
        improvement,
        improvementPct: originalEvaluation.totalUtility > 0 
          ? (improvement / originalEvaluation.totalUtility) * 100 
          : 0,
      },
    };
  }

  /**
   * 判断是否需要优化
   */
  private shouldOptimize(
    fatigueStats: DreCandidate['fatigueStats'],
    evaluation: ObjectiveEvaluationResult,
    config: DreOptimizationConfig
  ): boolean {
    // 1. 疲劳指数过高
    if (fatigueStats.max > (config.fatigueThreshold || 1.1) * 1.3) {
      return true;
    }
    
    // 2. 超载天数过多
    if (fatigueStats.overloadedDays > 0) {
      return true;
    }
    
    // 3. 方差过大（节奏不均匀）
    if (fatigueStats.variance > (config.varianceThreshold || 0.15)) {
      return true;
    }
    
    // 4. 疲劳风险惩罚过高
    if (evaluation.breakdown.fatigueRiskPenalty > 0.2) {
      return true;
    }
    
    // 5. 节奏方差惩罚过高
    if (evaluation.breakdown.pacingVariancePenalty > 0.15) {
      return true;
    }
    
    return false;
  }

  /**
   * 计算疲劳统计
   */
  private calculateFatigueStats(dayProfiles: DayProfile[]): DreCandidate['fatigueStats'] {
    if (dayProfiles.length === 0) {
      return { mean: 0, variance: 0, max: 0, overloadedDays: 0 };
    }
    
    const fatigueIndices = dayProfiles.map(d => d.fatigueIndex);
    const mean = fatigueIndices.reduce((a, b) => a + b, 0) / fatigueIndices.length;
    const variance = fatigueIndices.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / fatigueIndices.length;
    const max = Math.max(...fatigueIndices);
    const overloadedDays = fatigueIndices.filter(f => f > 1.1).length;
    
    return { mean, variance, max, overloadedDays };
  }

  /**
   * 生成拆天候选方案
   */
  private generateSplitDayCandidates(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    dayProfiles: DayProfile[],
    pace: PaceConstraints
  ): DreCandidate[] {
    const candidates: DreCandidate[] = [];
    
    // 找出超载天
    const overloadedDays = dayProfiles.filter(d => d.fatigueIndex > 1.1);
    
    for (const day of overloadedDays) {
      if (day.segments.length < 2) continue; // 无法拆分
      
      // 找最佳拆分点
      let bestSplit: { idx: number; maxFatigue: number } | null = null;
      
      for (let i = 0; i < day.segments.length - 1; i++) {
        const firstPart = day.segments.slice(0, i + 1);
        const secondPart = day.segments.slice(i + 1);
        
        const firstFatigue = this.calculatePartialFatigue(firstPart, pace);
        const secondFatigue = this.calculatePartialFatigue(secondPart, pace);
        const maxFatigue = Math.max(firstFatigue, secondFatigue);
        
        if (!bestSplit || maxFatigue < bestSplit.maxFatigue) {
          bestSplit = { idx: i, maxFatigue };
        }
      }
      
      if (bestSplit && bestSplit.maxFatigue < day.fatigueIndex) {
        // 创建拆分方案
        const splitPlan = this.applySplitDay(plan, day.dayIndex, bestSplit.idx);
        const splitDayProfiles = this.buildDayProfiles(splitPlan, world, pace);
        
        candidates.push({
          type: 'SPLIT_DAY',
          plan: splitPlan,
          evaluation: null as any, // 将在后续填充
          modifications: [`将第 ${day.dayIndex + 1} 天拆分为两天`],
          utilityImprovement: 0,
          fatigueStats: this.calculateFatigueStats(splitDayProfiles),
        });
      }
    }
    
    return candidates;
  }

  /**
   * 生成休息日候选方案
   */
  private generateBufferDayCandidates(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    dayProfiles: DayProfile[],
    pace: PaceConstraints
  ): DreCandidate[] {
    const candidates: DreCandidate[] = [];
    
    // 检测滚动疲劳窗口
    const rollingIssues = this.detectRollingFatigue(dayProfiles, pace);
    
    if (rollingIssues.length > 0) {
      // 在最累的窗口后插入休息日
      const issue = rollingIssues[0];
      const windowDays = dayProfiles.filter(
        d => d.dayIndex >= issue.startDay && d.dayIndex <= issue.endDay
      );
      
      if (windowDays.length > 0) {
        const worstDay = windowDays.reduce((max, d) =>
          d.fatigueIndex > max.fatigueIndex ? d : max
        );
        
        const bufferPlan = this.applyBufferDay(plan, worstDay.dayIndex);
        const bufferDayProfiles = this.buildDayProfiles(bufferPlan, world, pace);
        
        candidates.push({
          type: 'INSERT_BUFFER',
          plan: bufferPlan,
          evaluation: null as any,
          modifications: [`在第 ${worstDay.dayIndex + 1} 天后插入休息日`],
          utilityImprovement: 0,
          fatigueStats: this.calculateFatigueStats(bufferDayProfiles),
        });
      }
    }
    
    // 如果有连续高负荷天，也建议插入休息日
    let consecutiveHigh = 0;
    let highStartDay = -1;
    
    for (let i = 0; i < dayProfiles.length; i++) {
      if (dayProfiles[i].fatigueIndex > 1.0) {
        if (consecutiveHigh === 0) highStartDay = i;
        consecutiveHigh++;
      } else {
        if (consecutiveHigh >= 3) {
          // 连续 3 天以上高负荷
          const bufferPlan = this.applyBufferDay(plan, highStartDay + 1);
          const bufferDayProfiles = this.buildDayProfiles(bufferPlan, world, pace);
          
          candidates.push({
            type: 'INSERT_BUFFER',
            plan: bufferPlan,
            evaluation: null as any,
            modifications: [`在连续高负荷段（第 ${highStartDay + 1} 天后）插入休息日`],
            utilityImprovement: 0,
            fatigueStats: this.calculateFatigueStats(bufferDayProfiles),
          });
        }
        consecutiveHigh = 0;
      }
    }
    
    return candidates;
  }

  /**
   * 生成负载均衡候选方案
   */
  private generateLoadBalanceCandidates(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    dayProfiles: DayProfile[],
    pace: PaceConstraints
  ): DreCandidate[] {
    const candidates: DreCandidate[] = [];
    
    // 简化：尝试将高负荷天的最后一段移到下一天
    for (let i = 0; i < dayProfiles.length - 1; i++) {
      const currentDay = dayProfiles[i];
      const nextDay = dayProfiles[i + 1];
      
      // 当前天高负荷，下一天有余量
      if (currentDay.fatigueIndex > 1.0 && nextDay.fatigueIndex < 0.8 && currentDay.segments.length > 1) {
        const balancePlan = this.applyLoadBalance(plan, currentDay.dayIndex);
        
        if (balancePlan) {
          const balanceDayProfiles = this.buildDayProfiles(balancePlan, world, pace);
          
          candidates.push({
            type: 'LOAD_BALANCE',
            plan: balancePlan,
            evaluation: null as any,
            modifications: [`将第 ${currentDay.dayIndex + 1} 天的部分行程移至第 ${nextDay.dayIndex + 1} 天`],
            utilityImprovement: 0,
            fatigueStats: this.calculateFatigueStats(balanceDayProfiles),
          });
        }
      }
    }
    
    return candidates;
  }

  // ========== 方案应用方法 ==========

  /**
   * 应用拆天方案
   */
  private applySplitDay(
    plan: RoutePlanDraft,
    dayIndex: number,
    splitAfterIdx: number
  ): RoutePlanDraft {
    const newSegments: RouteSegment[] = [];
    
    for (const seg of plan.segments) {
      if (seg.dayIndex < dayIndex) {
        newSegments.push(seg);
      } else if (seg.dayIndex === dayIndex) {
        const sameDaySegs = plan.segments.filter(s => s.dayIndex === dayIndex);
        const segIdx = sameDaySegs.indexOf(seg);
        
        if (segIdx <= splitAfterIdx) {
          newSegments.push(seg);
        } else {
          newSegments.push({ ...seg, dayIndex: seg.dayIndex + 1 });
        }
      } else {
        newSegments.push({ ...seg, dayIndex: seg.dayIndex + 1 });
      }
    }
    
    return { ...plan, segments: newSegments };
  }

  /**
   * 应用休息日方案
   */
  private applyBufferDay(
    plan: RoutePlanDraft,
    insertAfterDayIndex: number
  ): RoutePlanDraft {
    const newSegments: RouteSegment[] = [];
    
    for (const seg of plan.segments) {
      if (seg.dayIndex <= insertAfterDayIndex) {
        newSegments.push(seg);
      } else {
        newSegments.push({ ...seg, dayIndex: seg.dayIndex + 1 });
      }
    }
    
    // 添加休息日占位
    newSegments.push({
      segmentId: `REST_${insertAfterDayIndex + 1}_${Date.now()}`,
      dayIndex: insertAfterDayIndex + 1,
      distanceKm: 0,
      ascentM: 0,
      slopePct: 0,
      metadata: { type: 'REST_DAY' },
    });
    
    return { ...plan, segments: newSegments };
  }

  /**
   * 应用负载均衡方案
   */
  private applyLoadBalance(
    plan: RoutePlanDraft,
    fromDayIndex: number
  ): RoutePlanDraft | null {
    const fromDaySegs = plan.segments.filter(s => s.dayIndex === fromDayIndex);
    
    if (fromDaySegs.length < 2) return null;
    
    // 移动最后一段到下一天
    const segToMove = fromDaySegs[fromDaySegs.length - 1];
    
    const newSegments = plan.segments.map(seg => {
      if (seg.segmentId === segToMove.segmentId) {
        return { ...seg, dayIndex: seg.dayIndex + 1 };
      }
      return seg;
    });
    
    return { ...plan, segments: newSegments };
  }

  // ========== 辅助方法 ==========

  /**
   * 计算部分路段的疲劳指数
   */
  private calculatePartialFatigue(segments: RouteSegment[], pace: PaceConstraints): number {
    const totalDistanceKm = segments.reduce((s, seg) => s + seg.distanceKm, 0);
    const totalAscentM = segments.reduce((s, seg) => s + seg.ascentM, 0);
    const maxSlopePct = Math.max(...segments.map(s => s.slopePct || 0));
    const estMovingHours = this.fatigueCalculator.estimateMovingHours(totalDistanceKm, totalAscentM);
    
    return this.fatigueCalculator.computeFatigueIndex(
      {
        dayIndex: 0,
        segments,
        totalDistanceKm,
        totalAscentM,
        maxSlopePct,
        estMovingHours,
        fatigueIndex: 0,
      },
      pace
    );
  }

  /**
   * 检测滚动疲劳
   */
  private detectRollingFatigue(
    dayProfiles: DayProfile[],
    pace: PaceConstraints
  ): Array<{ startDay: number; endDay: number; totalAscent: number }> {
    const issues: Array<{ startDay: number; endDay: number; totalAscent: number }> = [];
    
    for (let i = 0; i < dayProfiles.length - 2; i++) {
      const window = dayProfiles.slice(i, i + 3);
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
   * 构建节奏约束
   */
  private buildPaceConstraints(world: WorldModelContext): PaceConstraints {
    const human = world.human;
    const softConstraints = world.routeDirection.constraints?.soft || {};
    
    return {
      maxDailyAscentM: Math.min(
        human.maxDailyAscentM,
        softConstraints.maxDailyAscentM || Infinity
      ),
      maxDailyDistanceKm: human.preferredPace === 'SLOW' ? 18 
        : human.preferredPace === 'FAST' ? 24 
        : 22,
      maxMovingHours: human.preferredPace === 'SLOW' ? 7 
        : human.preferredPace === 'FAST' ? 10 
        : 9,
      rollingAscent3DaysM: human.rollingAscent3DaysM,
    };
  }

  /**
   * 构建每日画像
   */
  private buildDayProfiles(
    plan: RoutePlanDraft,
    world: WorldModelContext,
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
        const maxSlopePct = Math.max(...segments.map(s => s.slopePct || 0), 0);
        const estMovingHours = this.fatigueCalculator.estimateMovingHours(totalDistanceKm, totalAscentM);
        
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
      });
  }

  /**
   * 生成无变化日志
   */
  private generateNoChangeLog(fatigueStats: DreCandidate['fatigueStats']): DecisionLogEntry[] {
    return [{
      persona: 'DR_DRE',
      action: 'ALLOW',
      explanation: `日节奏与连续疲劳均在可接受范围内（平均疲劳 ${fatigueStats.mean.toFixed(2)}，方差 ${fatigueStats.variance.toFixed(3)}），无需结构调整`,
      reasonCodes: [],
      evidenceRefs: [],
      timestamp: new Date().toISOString(),
      decisionSource: 'HUMAN',
      decisionStage: 'PACE_ADJUST',
    }];
  }

  /**
   * 生成优化日志
   */
  private generateOptimizationLogs(
    original: DreCandidate,
    recommended: DreCandidate,
    allCandidates: DreCandidate[]
  ): DecisionLogEntry[] {
    const logs: DecisionLogEntry[] = [];
    
    // 主决策日志
    if (recommended.type === 'ORIGINAL') {
      logs.push({
        persona: 'DR_DRE',
        action: 'ALLOW',
        explanation: `评估了 ${allCandidates.length} 个候选方案，原始方案已是最优`,
        reasonCodes: [],
        evidenceRefs: [],
        timestamp: new Date().toISOString(),
        decisionSource: 'HUMAN',
        decisionStage: 'PACE_ADJUST',
      });
    } else {
      const improvement = ((recommended.evaluation.totalUtility - original.evaluation.totalUtility) * 100).toFixed(1);
      
      logs.push({
        persona: 'DR_DRE',
        action: 'ADJUST',
        explanation: `评估了 ${allCandidates.length} 个候选方案，推荐 ${recommended.type} 方案，效用提升 ${improvement}%`,
        reasonCodes: [recommended.type],
        evidenceRefs: recommended.modifications,
        timestamp: new Date().toISOString(),
        decisionSource: 'HUMAN',
        decisionStage: 'PACE_ADJUST',
      });
      
      // 详细修改日志
      for (const mod of recommended.modifications) {
        logs.push({
          persona: 'DR_DRE',
          action: 'ADJUST',
          explanation: mod,
          reasonCodes: [],
          evidenceRefs: [],
          timestamp: new Date().toISOString(),
          decisionSource: 'HUMAN',
          decisionStage: 'PACE_ADJUST',
        });
      }
    }
    
    // 疲劳统计对比日志
    logs.push({
      persona: 'DR_DRE',
      action: 'ALLOW',
      explanation: `疲劳指数: 优化前 [均值=${original.fatigueStats.mean.toFixed(2)}, 最大=${original.fatigueStats.max.toFixed(2)}, 超载=${original.fatigueStats.overloadedDays}天] → 优化后 [均值=${recommended.fatigueStats.mean.toFixed(2)}, 最大=${recommended.fatigueStats.max.toFixed(2)}, 超载=${recommended.fatigueStats.overloadedDays}天]`,
      reasonCodes: ['FATIGUE_COMPARISON'],
      evidenceRefs: [],
      timestamp: new Date().toISOString(),
      decisionSource: 'HUMAN',
      decisionStage: 'PACE_ADJUST',
    });
    
    return logs;
  }

  /**
   * 获取优化摘要（用于 UI 展示）
   */
  getOptimizationSummary(result: DreOptimizationResult): {
    status: 'OPTIMAL' | 'IMPROVED' | 'NO_CHANGE';
    statusEmoji: string;
    headline: string;
    details: string[];
    recommendation: string;
  } {
    if (!result.needsAdjustment) {
      return {
        status: 'OPTIMAL',
        statusEmoji: '✅',
        headline: '当前节奏已是最优',
        details: [
          `平均疲劳指数: ${result.recommendedCandidate.fatigueStats.mean.toFixed(2)}`,
          `方差: ${result.recommendedCandidate.fatigueStats.variance.toFixed(3)}`,
        ],
        recommendation: '保持当前计划',
      };
    }
    
    const improvementPct = result.summary.improvementPct.toFixed(1);
    
    return {
      status: 'IMPROVED',
      statusEmoji: '🔧',
      headline: `发现更优方案（提升 ${improvementPct}%）`,
      details: result.recommendedCandidate.modifications,
      recommendation: `建议采用 ${this.getCandidateTypeLabel(result.recommendedCandidate.type)} 方案`,
    };
  }

  /**
   * 获取候选类型标签
   */
  private getCandidateTypeLabel(type: DreCandidateType): string {
    const labels: Record<DreCandidateType, string> = {
      ORIGINAL: '原始',
      SPLIT_DAY: '拆天',
      INSERT_BUFFER: '插入休息日',
      REORDER_SEGMENTS: '重排序',
      LOAD_BALANCE: '负载均衡',
    };
    return labels[type];
  }
}
