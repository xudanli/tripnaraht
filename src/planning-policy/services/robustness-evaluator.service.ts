// src/planning-policy/services/robustness-evaluator.service.ts

import { Injectable } from '@nestjs/common';
import { PlanningPolicy } from '../interfaces/planning-policy.interface';
import {
  DayScheduleResult,
  PlannedStop,
} from '../interfaces/scheduler.interface';
import { Poi, OpeningHours } from '../interfaces/poi.interface';
import { TransitSegment } from '../interfaces/transit-segment.interface';
import { DefaultCostModelInstance } from './cost-model.service';
import { HpSimulatorService } from './hp-simulator.service';
import {
  isOpenAt,
  latestEntryMin,
  isHoliday,
  hhmmToMin,
  withinTimeWindowForEvaluation,
  getEntryDeadlineInfoForEvaluation,
  TimeWindowStatus,
  DayOfWeek,
} from '../utils/time-utils';

/**
 * 随机数生成器
 */
export interface Rng {
  /** 返回 [0, 1) 的随机数 */
  next(): number;
}

/**
 * Mulberry32 随机数生成器（可复现）
 */
export function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return {
    next() {
      t += 0x6d2b79f5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/**
 * 标准正态分布随机数（Box-Muller）
 */
function normal01(rng: Rng): number {
  const u1 = Math.max(rng.next(), 1e-12);
  const u2 = Math.max(rng.next(), 1e-12);
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * 截断到范围
 */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * 截断正态分布采样
 */
function sampleTruncatedNormal(
  rng: Rng,
  mean: number,
  std: number,
  min = 0,
  max = Number.POSITIVE_INFINITY
): number {
  if (std <= 0) return clamp(mean, min, max);

  // 简单拒绝采样（轻量版足够）
  for (let i = 0; i < 12; i++) {
    const v = mean + std * normal01(rng);
    if (v >= min && v <= max) return v;
  }

  // 兜底：截断
  return clamp(mean, min, max);
}

/**
 * 稳健度评估配置
 */
export interface RobustnessConfig {
  /** 采样次数，默认 300 */
  samples?: number;
  /** 随机种子，默认 42 */
  seed?: number;
  /** "准点"允许的缓冲（分钟），默认 0 */
  onTimeSlackMin?: number;
  /** 交通方差：当 TransitSegment 没有明确 std/reliability 时，用此比例，默认 0.12（12%） */
  defaultTransitStdRatio?: number;
  /** 排队方差：无 std 时按均值比例，默认 0.35 */
  defaultQueueStdRatio?: number;
  /** 游玩方差：无 std 时按均值比例，默认 0.25 */
  defaultVisitStdRatio?: number;
  /** 游玩时的站立/慢走疲劳（每分钟），默认 0.06（轻量） */
  visitStandHpPerMin?: number;
}

/**
 * POI 查找接口
 */
export interface PoiLookup {
  getPoiById(poiId: string): Poi | undefined;
}

/**
 * Map 实现的 POI 查找
 */
export class MapPoiLookup implements PoiLookup {
  constructor(private map: Map<string, Poi>) {}

  getPoiById(id: string): Poi | undefined {
    return this.map.get(id);
  }
}

/**
 * 每个 POI 的时间窗错过原因统计（只统计真正的 miss，不包括 WAIT）
 */
export interface PerPoiWindowRisk {
  /** POI ID */
  poiId: string;
  /** 错过概率（0-1） */
  missProb: number;
  /** 最常见原因（Top 3），只包含失败原因：CLOSED_DATE / NO_WINDOW_TODAY / MISSED_LAST_ENTRY / CLOSED_REST_OF_DAY */
  reasonTop: Array<{ reason: string; prob: number }>;
}

/**
 * 每个 POI 的时间窗等待风险统计（WAIT 不等于 MISS）
 */
export interface PerPoiWindowWaitRisk {
  /** POI ID */
  poiId: string;
  /** 等待发生概率（0-1） */
  waitProb: number;
  /** 等待时间 P50（中位数，分钟） */
  waitP50Min: number;
  /** 等待时间 P90（90分位数，分钟） */
  waitP90Min: number;
}

/**
 * 每个 POI 的入场裕量分布（用于生成优化建议）
 */
export interface PerPoiEntrySlackRisk {
  /** POI ID */
  poiId: string;
  /** slack 均值（分钟），slack = deadlineMin - entryMin */
  slackMeanMin: number;
  /** slack P10（10分位数，分钟） */
  slackP10Min: number;
  /** slack P50（中位数，分钟） */
  slackP50Min: number;
  /** slack P90（90分位数，分钟） */
  slackP90Min: number;
  /** slack < 0 的概率（0-1） */
  slackNegProb: number;
  /** deadline 是谁在卡（lastEntry / windowEnd） */
  deadlineTypeTop?: Array<{
    type: 'LAST_ENTRY' | 'WINDOW_END' | 'UNKNOWN';
    prob: number;
  }>;
}

/**
 * 优化建议类型
 */
export type OptimizationSuggestion =
  | {
      type: 'SHIFT_EARLIER';
      poiId: string;
      minutes: number;
      reason: string;
    }
  | { type: 'REORDER_AVOID_WAIT'; poiId: string; reason: string }
  | { type: 'UPGRADE_TRANSIT'; poiId: string; reason: string };

/**
 * What-If 候选方案
 */
export interface WhatIfCandidate {
  /** 唯一 ID */
  id: string;
  /** UI 标题 */
  title: string;
  /** 解释说明 */
  description: string;
  /** 候选计划 */
  schedule: DayScheduleResult;
  /** 评估结果 */
  metrics: RobustnessMetrics;
  /** 差异摘要（相对于 base） */
  deltaSummary?: {
    /** Miss 变化（ratio delta，负数更好，e.g. -0.12 means -12 percentage points (pp)） */
    missDelta?: number;
    /** Wait 变化（ratio delta，负数更好，e.g. -0.12 means -12 percentage points (pp)） */
    waitDelta?: number;
    /** 完成率 P10 变化（ratio delta，正数更好，e.g. 0.14 means +14 percentage points (pp)） */
    completionP10Delta?: number;
    /** OnTime 变化（ratio delta，正数更好，e.g. 0.06 means +6 percentage points (pp)） */
    onTimeDelta?: number;
    /** 一句话解释 */
    reason?: string;
  };
  /** 计划警告（用于 UI 提示） */
  scheduleWarnings?: Array<'TIMELINE_BROKEN' | 'SHIFT_CLAMPED'>;
  /** 改动幅度量化（用于决策） */
  impactCost?: {
    /** 所有 stop 的 |Δstart| 之和（分钟） */
    timeShiftAbsSumMin: number;
    /** 发生变化的 stop 数 */
    movedStopCount: number;
    /** POI 顺序是否变化（swap） */
    poiOrderChanged: boolean;
    /** 改动严重程度 */
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  /** 提升显著性（避免"改善 1pp 也推荐"） */
  confidence?: {
    /** 置信等级 */
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    /** 原因说明 */
    reason: string;
  };
  /** 改善来源驱动因素（结构化，方便 UI 用 icon/tag 展示） */
  explainTopDrivers?: Array<
    | { driver: 'MISS'; deltaPp: number }
    | { driver: 'WAIT'; deltaPp: number }
    | { driver: 'COMPLETION_P10'; deltaPp: number }
    | { driver: 'ONTIME'; deltaPp: number }
  >;
  /** V2 预埋：候选操作类型 */
  action?: WhatIfAction;
}

/**
 * What-If 操作类型（V2 预埋接口）
 */
export type WhatIfAction =
  | { type: 'SHIFT_EARLIER'; poiId: string; minutes: number }
  | { type: 'SWAP_NEIGHBOR'; poiId: string; direction: 'PREV' | 'NEXT' }
  | { type: 'UPGRADE_TRANSIT'; segmentId: string; mode: 'TAXI' | 'EXPRESS' }
  | {
      type: 'AUTO_REPLAN';
      trigger: 'MISS' | 'EXCESSIVE_WAIT';
      scope: 'REMAINING_DAY' | 'NEXT_3_STOPS';
    };

/**
 * What-If 评估报告元数据
 */
export interface WhatIfReportMeta {
  /** base 评估使用的 samples */
  baseSamples: number;
  /** 候选评估使用的 samples */
  candidateSamples: number;
  /** 复评（re-eval winner）使用的 samples */
  confirmSamples: number;
  /** base 评估使用的 seed */
  baseSeed: number;
}

/**
 * What-If 评估上下文（V2 预埋接口）
 */
export interface WhatIfEvalContext {
  policy: PlanningPolicy;
  dayEndMin: number;
  dateISO: string;
  dayOfWeek: DayOfWeek;
  poiLookup: PoiLookup;
  budget: WhatIfReportMeta;
}

/**
 * 构建的候选方案（V2 预埋接口）
 * 
 * Transformer 直接产出"可展示 + 可执行"的候选
 */
export interface BuiltCandidate {
  schedule: DayScheduleResult;
  action: WhatIfAction;
  title: string;
  description: string;
}

/**
 * What-If 变换器接口（V2 预埋接口）
 * 
 * V1.5 的 SHIFT/SWAP 就是两个 transformer。V2 只需要新增 transformer，不动主流程。
 * 
 * Transformer 直接产出 BuiltCandidate（可展示 + 可执行），而不是裸 schedule。
 */
export interface WhatIfTransformer {
  /** 变换器类型 */
  type: WhatIfAction['type'];
  /** 从 base schedule 生成候选方案（返回 BuiltCandidate，包含 title/description） */
  buildCandidates(args: {
    base: DayScheduleResult;
    context: WhatIfEvalContext;
  }): BuiltCandidate[];
  /** 可选：验证候选方案 */
  validate?(
    c: BuiltCandidate,
    base: DayScheduleResult
  ): { ok: boolean; warnings?: string[] };
}

/**
 * What-If 评估报告
 */
export interface WhatIfReport {
  /** 原计划 */
  base: WhatIfCandidate;
  /** 备选方案（2~3个） */
  candidates: WhatIfCandidate[];
  /** 可选：自动推荐的最佳方案 ID（winner 的 action 一定存在） */
  winnerId?: string;
  /** 风险红线提示（当 severity HIGH 但收益不够大时） */
  riskWarning?: {
    candidateId: string;
    message: string;
  };
  /** 评估元数据（预算策略、seed 等） */
  meta: WhatIfReportMeta;
}

/**
 * 单日稳健度指标
 */
export interface RobustnessMetrics {
  /** 采样次数 */
  samples: number;
  /** 准点概率（finish <= end + slack） */
  onTimeProb: number;
  /** 期望超时时间（分钟） */
  expectedOvertimeMin: number;
  /** 超时 P90（90分位数，分钟） */
  overtimeP90Min: number;
  /** HP 结束均值 */
  hpEndMean: number;
  /** HP 结束 P10（10分位数，更保守） */
  hpEndP10: number;
  /** 成本均值 */
  costMean: number;
  /** 成本 P90 */
  costP90: number;
  /** 风险等级 */
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  /** 诊断信息 */
  diagnostics: {
    /** 交通随机波动带来的平均增量（分钟） */
    avgTransitDeltaMin: number;
    /** 排队随机波动带来的平均增量（分钟） */
    avgQueueDeltaMin: number;
    /** 游玩随机波动带来的平均增量（分钟） */
    avgVisitDeltaMin: number;
    /** 时间窗等待带来的平均增量（分钟） */
    avgWindowWaitDeltaMin: number;
  };
  /** 时间窗冲突风险（新增）：至少错过 1 个 POI 的概率 */
  timeWindowMissProb: number;
  /** 每个 POI 的错过概率（新增）：只统计真正的 miss，不包括 WAIT */
  perPoiMissProb: PerPoiWindowRisk[];
  /** 时间窗等待风险（新增）：至少发生一次 WAIT 的概率 */
  windowWaitProb: number;
  /** 每个 POI 的等待风险（新增）：WAIT 不等于 MISS */
  perPoiWaitProb: PerPoiWindowWaitRisk[];
  /** 完成率指标（新增）：SKIP 策略的稳健性补充 */
  completedPoiMean: number;
  /** 完成 POI 数量 P10（10分位数，更保守） */
  completedPoiP10: number;
  /** 完成率均值（completed / planned） */
  completionRateMean: number;
  /** 完成率 P10（10分位数，更保守） */
  completionRateP10: number;
  /** 入场裕量分布（用于生成优化建议） */
  perPoiEntrySlack: PerPoiEntrySlackRisk[];
}

/**
 * 稳健度评估服务
 * 
 * 使用蒙特卡洛方法评估行程的稳健度
 */
@Injectable()
export class RobustnessEvaluatorService {
  constructor(private hpSimulator: HpSimulatorService) {}

  /**
   * 评估单日稳健度
   * 
   * 新增参数：
   * - dateISO：日期（用于节假日和闭馆日期判断）
   * - dayOfWeek：星期几（用于时间窗匹配）
   */
  evaluateDayRobustness(args: {
    policy: PlanningPolicy;
    schedule: DayScheduleResult;
    dayEndMin: number;
    dateISO: string;
    dayOfWeek: DayOfWeek;
    poiLookup: PoiLookup;
    config?: RobustnessConfig;
  }): RobustnessMetrics {
    const cfg: Required<RobustnessConfig> = {
      samples: args.config?.samples ?? 300,
      seed: args.config?.seed ?? 42,
      onTimeSlackMin: args.config?.onTimeSlackMin ?? 0,
      defaultTransitStdRatio: args.config?.defaultTransitStdRatio ?? 0.12,
      defaultQueueStdRatio: args.config?.defaultQueueStdRatio ?? 0.35,
      defaultVisitStdRatio: args.config?.defaultVisitStdRatio ?? 0.25,
      visitStandHpPerMin: args.config?.visitStandHpPerMin ?? 0.06,
    };

    const finishes: number[] = [];
    const overtimes: number[] = [];
    const hps: number[] = [];
    const costs: number[] = [];
    const transitDeltas: number[] = [];
    const queueDeltas: number[] = [];
    const visitDeltas: number[] = [];
    const windowWaitDeltas: number[] = [];

    // 时间窗错过统计
    let missAnyCount = 0;
    const missCountsByPoi: Record<string, Record<string, number>> = {};
    const poiSeen = new Set<string>();

    // 时间窗等待统计（WAIT 不等于 MISS）
    let waitAnyCount = 0;
    const waitSamplesByPoi: Record<string, number[]> = {}; // poiId -> all waits across samples

    // 完成率统计
    const completedCounts: number[] = [];
    const completionRates: number[] = [];

    // 入场裕量统计
    const slackAllByPoi: Record<string, number[]> = {};
    const deadlineTypeAllByPoi: Record<string, Record<string, number>> = {};


    for (let i = 0; i < cfg.samples; i++) {
      const local = mulberry32((cfg.seed + i * 9973) >>> 0);
      const sim = this.simulateOnce({
        policy: args.policy,
        schedule: args.schedule,
        dayEndMin: args.dayEndMin,
        dateISO: args.dateISO,
        dayOfWeek: args.dayOfWeek,
        cfg,
        poiLookup: args.poiLookup,
        rng: local,
      });

      finishes.push(sim.finishMin);
      overtimes.push(sim.overtimeMin);
      hps.push(sim.hpEnd);
      costs.push(sim.cost);
      transitDeltas.push(sim.transitDelta);
      queueDeltas.push(sim.queueDelta);
      visitDeltas.push(sim.visitDelta);
      windowWaitDeltas.push(sim.windowWaitDelta);

      // 统计时间窗错过
      if (sim.missedAnyWindow) {
        missAnyCount++;
      }

      // 合并 per-poi reason counts（只统计真正的 miss，不包括 WAIT）
      for (const [poiId, reasons] of Object.entries(sim.missedByPoi)) {
        poiSeen.add(poiId);
        missCountsByPoi[poiId] = missCountsByPoi[poiId] ?? {};
        for (const [reason, count] of Object.entries(reasons)) {
          missCountsByPoi[poiId][reason] =
            (missCountsByPoi[poiId][reason] ?? 0) + count;
        }
      }

      // 统计时间窗等待（WAIT 不等于 MISS）
      if (sim.waitedAnyWindow) {
        waitAnyCount++;
      }
      for (const [poiId, waits] of Object.entries(sim.waitByPoi ?? {})) {
        (waitSamplesByPoi[poiId] ??= []).push(...waits);
      }

      // 统计完成率
      completedCounts.push(sim.completedPoiCount);
      completionRates.push(
        sim.plannedPoiCount
          ? sim.completedPoiCount / sim.plannedPoiCount
          : 1
      );

      // 统计入场裕量
      for (const [poiId, samples] of Object.entries(
        sim.perPoiSlackSamples ?? {}
      )) {
        (slackAllByPoi[poiId] ??= []).push(...samples);
      }

      for (const [poiId, typeCounts] of Object.entries(
        sim.perPoiDeadlineTypeCounts ?? {}
      )) {
        deadlineTypeAllByPoi[poiId] = deadlineTypeAllByPoi[poiId] ?? {};
        for (const [type, cnt] of Object.entries(typeCounts)) {
          deadlineTypeAllByPoi[poiId][type] =
            (deadlineTypeAllByPoi[poiId][type] ?? 0) + cnt;
        }
      }
    }

    // 计算时间窗错过概率
    const timeWindowMissProb = missAnyCount / cfg.samples;

    // 计算每个 POI 的错过概率（只统计真正的 miss，不包括 WAIT）
    const perPoiMissProb: PerPoiWindowRisk[] = Array.from(poiSeen).map(
      (poiId) => {
        const reasons = missCountsByPoi[poiId] ?? {};
        const totalMiss = Object.values(reasons).reduce((a, b) => a + b, 0);
        const missProb = totalMiss / cfg.samples;

        const reasonTop = Object.entries(reasons)
          .map(([reason, cnt]) => ({ reason, prob: cnt / cfg.samples }))
          .sort((a, b) => b.prob - a.prob)
          .slice(0, 3);

        return { poiId, missProb, reasonTop };
      }
    );
    perPoiMissProb.sort((a, b) => b.missProb - a.missProb);

    // 计算时间窗等待风险（WAIT 不等于 MISS）
    const windowWaitProb = waitAnyCount / cfg.samples;
    const perPoiWaitProb: PerPoiWindowWaitRisk[] = Object.entries(
      waitSamplesByPoi
    ).map(([poiId, waits]) => {
      // waitProb：该 poi 在多少样本里发生过 wait（轻量近似）
      const waitProb = Math.min(1, waits.length / cfg.samples);
      const sorted = [...waits].sort((a, b) => a - b);
      const q = (p: number) =>
        sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : 0;
      return {
        poiId,
        waitProb,
        waitP50Min: q(0.5),
        waitP90Min: q(0.9),
      };
    });
    perPoiWaitProb.sort((a, b) => b.waitProb - a.waitProb);

    // 计算完成率指标
    const completedPoiMean = this.mean(completedCounts);
    const completedPoiP10 = this.quantile(completedCounts, 0.1);
    const completionRateMean = this.mean(completionRates);
    const completionRateP10 = this.quantile(completionRates, 0.1);

    // 计算入场裕量分布
    const perPoiEntrySlack: PerPoiEntrySlackRisk[] = Object.entries(
      slackAllByPoi
    ).map(([poiId, arr]) => {
      const slackMeanMin = this.mean(arr);
      const slackP10Min = this.quantile(arr, 0.1);
      const slackP50Min = this.quantile(arr, 0.5);
      const slackP90Min = this.quantile(arr, 0.9);

      const slackNegProb =
        arr.filter((x) => x < 0).length / Math.max(1, arr.length);

      const tc = deadlineTypeAllByPoi[poiId] ?? {};
      const total = Object.values(tc).reduce((a, b) => a + b, 0) || 1;
      const deadlineTypeTop = Object.entries(tc)
        .map(([type, cnt]) => ({
          type: type as 'LAST_ENTRY' | 'WINDOW_END' | 'UNKNOWN',
          prob: cnt / total,
        }))
        .sort((a, b) => b.prob - a.prob)
        .slice(0, 2);

      return {
        poiId,
        slackMeanMin,
        slackP10Min,
        slackP50Min,
        slackP90Min,
        slackNegProb,
        deadlineTypeTop,
      };
    });
    // P10 最紧的排前面
    perPoiEntrySlack.sort((a, b) => a.slackP10Min - b.slackP10Min);

    const onTime =
      finishes.filter((f) => f <= args.dayEndMin + cfg.onTimeSlackMin).length /
      cfg.samples;

    const overtimeMean = this.mean(overtimes);
    const overtimeP90 = this.quantile(overtimes, 0.9);
    const hpMean = this.mean(hps);
    const hpP10 = this.quantile(hps, 0.1);
    const costMean = this.mean(costs);
    const costP90 = this.quantile(costs, 0.9);

    return {
      samples: cfg.samples,
      onTimeProb: onTime,
      expectedOvertimeMin: overtimeMean,
      overtimeP90Min: overtimeP90,
      hpEndMean: hpMean,
      hpEndP10: hpP10,
      costMean,
      costP90,
      riskLevel: this.riskLevelFromAll(
        onTime,
        overtimeP90,
        hpP10,
        completionRateP10
      ),
      diagnostics: {
        avgTransitDeltaMin: this.mean(transitDeltas),
        avgQueueDeltaMin: this.mean(queueDeltas),
        avgVisitDeltaMin: this.mean(visitDeltas),
        avgWindowWaitDeltaMin: this.mean(windowWaitDeltas),
      },
      timeWindowMissProb,
      perPoiMissProb,
      windowWaitProb,
      perPoiWaitProb,
      completedPoiMean,
      completedPoiP10,
      completionRateMean,
      completionRateP10,
      perPoiEntrySlack,
    };
  }

  /**
   * 单次仿真
   * 
   * 新增时间窗检查：对每个 POI 到达时执行 withinTimeWindow() 逻辑
   */
  private simulateOnce(args: {
    policy: PlanningPolicy;
    schedule: DayScheduleResult;
    dayEndMin: number;
    dateISO: string;
    dayOfWeek: DayOfWeek;
    cfg: Required<RobustnessConfig>;
    poiLookup: PoiLookup;
    rng: Rng;
  }): {
    finishMin: number;
    overtimeMin: number;
    hpEnd: number;
    cost: number;
    transitDelta: number;
    queueDelta: number;
    visitDelta: number;
    windowWaitDelta: number;
    missedAnyWindow: boolean;
    missedByPoi: Record<string, Record<string, number>>;
    waitedAnyWindow: boolean;
    waitByPoi: Record<string, number[]>;
    plannedPoiCount: number;
    completedPoiCount: number;
    perPoiSlackSamples: Record<string, number[]>;
    perPoiDeadlineTypeCounts: Record<string, Record<string, number>>;
  } {
    const {
      policy,
      schedule,
      dayEndMin,
      dateISO,
      dayOfWeek,
      cfg,
      poiLookup,
      rng,
    } = args;
    const stops = schedule.stops;
    const startMin = stops[0]?.startMin ?? 0;

    let t = startMin;
    let hpState = {
      hp: policy.pacing.hpMax,
      lastRestAtMin: startMin,
      lastBreakAtMin: startMin,
    };

    let transitDelta = 0;
    let queueDelta = 0;
    let visitDelta = 0;
    let windowWaitDelta = 0;

    let totalTravelMin = 0;
    let totalWalkMin = 0;
    let totalTransfers = 0;
    let totalQueueMin = 0;

    // 时间窗错过统计
    let missedAnyWindow = false;
    const missedByPoi: Record<string, Record<string, number>> = {};

    const markMiss = (poiId: string, reason: string) => {
      missedAnyWindow = true;
      missedByPoi[poiId] = missedByPoi[poiId] ?? {};
      missedByPoi[poiId][reason] = (missedByPoi[poiId][reason] ?? 0) + 1;
    };

    // 时间窗等待统计（WAIT 不等于 MISS）
    let waitedAnyWindow = false;
    const waitByPoi: Record<string, number[]> = {};

    // 完成率统计（SKIP 策略的稳健性补充）
    const plannedPoiIds = new Set(
      stops.filter((s) => s.kind === 'POI').map((s) => s.id)
    );
    let completedPoiCount = 0;

    // 入场裕量统计（用于生成优化建议）
    const perPoiSlackSamples: Record<string, number[]> = {};
    const perPoiDeadlineTypeCounts: Record<string, Record<string, number>> = {};

    for (const s of stops) {
      if (s.transitIn) {
        const edgeCost = DefaultCostModelInstance.edgeCost({
          segment: s.transitIn,
          policy,
        });

        if (edgeCost === Number.POSITIVE_INFINITY) {
          t = dayEndMin + 9999;
          break;
        }

        const sampled = this.sampleTransitDuration(rng, s.transitIn, cfg);
        transitDelta += sampled - s.transitIn.durationMin;
        t += sampled;
        totalTravelMin += sampled;
        totalWalkMin += s.transitIn.walkMin;
        totalTransfers += s.transitIn.transferCount;

        hpState = this.hpSimulator.applyTravelFatigue({
          policy,
          hpState,
          travel: {
            walkMin: s.transitIn.walkMin,
            stairsCount: s.transitIn.stairsCount ?? 0,
          },
          nowMin: t,
        });
      } else {
        t = Math.max(t, s.startMin);
      }

      if (s.kind === 'POI') {
        const poi = poiLookup.getPoiById(s.id);
        if (!poi) {
          t = Math.max(t, s.endMin);
          continue;
        }

        // ✅ 时间窗检查：用随机到达时刻 t 来判断
        const arriveMin = t;
        const tw = withinTimeWindowForEvaluation({
          openingHours: poi.openingHours,
          dateISO,
          dayOfWeek,
          arriveMin,
        });

        if (!tw.ok) {
          // 时间窗 miss：跳过 POI（继续后续）
          // TypeScript 类型守卫：tw.ok === false 时，tw 必定有 reason 字段
          const reason =
            tw.ok === false ? tw.reason : 'UNKNOWN';
          markMiss(poi.id, reason);
          // 可选：加一个"失败成本"，让 costMean/costP90 更敏感
          // 这里简化：直接跳过，cost 会通过后续时间推进体现
          continue;
        }

        // WAIT_NEXT_WINDOW：等待到下一段窗口开始（会连锁影响后续）
        if (tw.waitMin > 0) {
          waitedAnyWindow = true;
          windowWaitDelta += tw.waitMin;
          // 记录该 POI 的等待时间
          (waitByPoi[poi.id] ??= []).push(tw.waitMin);
          t += tw.waitMin;

          // 等待也算进 queue（站立消耗）
          hpState = this.hpSimulator.applyTravelFatigue({
            policy,
            hpState,
            travel: { walkMin: 0, queueMin: tw.waitMin },
            nowMin: t,
          });
        }

        // ✅ 计算实际入场时刻（arrive + wait）
        const entryMin = arriveMin + (tw.waitMin ?? 0);

        // ✅ 计算 deadline 信息（lastEntry / windowEnd）
        const deadlineInfo = getEntryDeadlineInfoForEvaluation({
          openingHours: poi.openingHours,
          dateISO,
          dayOfWeek,
          entryMin,
        });

        if (deadlineInfo.deadlineMin !== undefined) {
          const slack = deadlineInfo.deadlineMin - entryMin; // ✅ slack 分钟
          (perPoiSlackSamples[poi.id] ??= []).push(slack);

          // deadlineType 统计（用于解释"是谁在卡"）
          const type =
            deadlineInfo.lastEntryMin !== undefined &&
            deadlineInfo.windowEndMin !== undefined
              ? deadlineInfo.deadlineMin === deadlineInfo.lastEntryMin
                ? 'LAST_ENTRY'
                : 'WINDOW_END'
              : deadlineInfo.lastEntryMin !== undefined
                ? 'LAST_ENTRY'
                : deadlineInfo.windowEndMin !== undefined
                  ? 'WINDOW_END'
                  : 'UNKNOWN';

          perPoiDeadlineTypeCounts[poi.id] =
            perPoiDeadlineTypeCounts[poi.id] ?? {};
          perPoiDeadlineTypeCounts[poi.id][type] =
            (perPoiDeadlineTypeCounts[poi.id][type] ?? 0) + 1;
        }

        // 下面继续原来的 queue + visit 采样
        const q = this.sampleQueueMin(rng, poi, cfg);
        queueDelta += q;
        totalQueueMin += q;

        if (q > 0) {
          hpState = this.hpSimulator.applyTravelFatigue({
            policy,
            hpState,
            travel: { walkMin: 0, queueMin: q },
            nowMin: t,
          });
        }

        t += q;

        const v = this.sampleVisitMin(rng, poi, cfg);
        const plannedVisit = Math.max(0, s.endMin - s.startMin);
        visitDelta += v - plannedVisit;

        const standHpCost = v * cfg.visitStandHpPerMin;
        hpState = { ...hpState, hp: Math.max(0, hpState.hp - standHpCost) };

        t += v;

        // ✅ POI 真正被执行（且未 miss）：计入完成数
        completedPoiCount++;
      } else if (s.kind === 'REST') {
        const restMin = Math.max(0, s.endMin - s.startMin);
        t += restMin;

        hpState = this.hpSimulator.applyRestRecovery({
          policy,
          hpState,
          restMin,
          nowMin: t,
          restBenefitHp: 0,
        });
      } else {
        const d = Math.max(0, s.endMin - s.startMin);
        t += d;
      }
    }

    const overtimeMin = Math.max(0, t - dayEndMin);

    const cost = DefaultCostModelInstance.itineraryCost(
      {
        totalTravelMin,
        totalWalkMin,
        totalTransfers,
        totalQueueMin,
        overtimeMin,
        totalStairsCount: 0,
        planChangeCount: 0,
      },
      policy
    );

    return {
      finishMin: t,
      overtimeMin,
      hpEnd: hpState.hp,
      cost,
      transitDelta,
      queueDelta,
      visitDelta,
      windowWaitDelta,
      missedAnyWindow,
      missedByPoi,
      waitedAnyWindow,
      waitByPoi,
      plannedPoiCount: plannedPoiIds.size,
      completedPoiCount,
      perPoiSlackSamples,
      perPoiDeadlineTypeCounts,
    };
  }

  /**
   * 采样交通时长
   */
  private sampleTransitDuration(
    rng: Rng,
    seg: TransitSegment,
    cfg: Required<RobustnessConfig>
  ): number {
    const base = Math.max(0, seg.durationMin);
    const rel = seg.reliability;
    const std =
      typeof rel === 'number'
        ? base * clamp((1 - rel) * 0.6, 0.05, 0.35)
        : base * cfg.defaultTransitStdRatio;

    return sampleTruncatedNormal(rng, base, std, 0);
  }

  /**
   * 采样排队时长
   */
  private sampleQueueMin(
    rng: Rng,
    poi: Poi,
    cfg: Required<RobustnessConfig>
  ): number {
    const mean = Math.max(0, poi.queueMinMean ?? 0);
    const std =
      Math.max(0, poi.queueMinStd ?? mean * cfg.defaultQueueStdRatio);
    return sampleTruncatedNormal(rng, mean, std, 0);
  }

  /**
   * 采样游玩时长
   */
  private sampleVisitMin(
    rng: Rng,
    poi: Poi,
    cfg: Required<RobustnessConfig>
  ): number {
    const mean = Math.max(5, poi.avgVisitMin ?? 30);
    const std =
      Math.max(0, poi.visitMinStd ?? mean * cfg.defaultVisitStdRatio);
    return sampleTruncatedNormal(rng, mean, std, 5);
  }

  /**
   * 计算均值
   */
  private mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * 计算分位数
   */
  private quantile(arr: number[], q: number): number {
    if (arr.length === 0) return 0;
    const a = [...arr].sort((x, y) => x - y);
    const pos = (a.length - 1) * clamp(q, 0, 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return a[lo];
    const w = pos - lo;
    return a[lo] * (1 - w) + a[hi] * w;
  }

  /**
   * 从指标计算风险等级（纳入完成率判断，修正 SKIP 策略的"假稳"问题）
   */
  private riskLevelFromAll(
    onTimeProb: number,
    overtimeP90: number,
    hpP10: number,
    completionP10: number
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    // 完成率过低 → 高风险（即使准点概率很高也算高风险）
    if (completionP10 < 0.5) return 'HIGH';
    if (completionP10 < 0.7) {
      // 完成率中等偏低 → 至少中等风险
      return onTimeProb >= 0.7 ? 'MEDIUM' : 'HIGH';
    }

    // 完成率正常时，按原有逻辑判断
    if (onTimeProb >= 0.8 && overtimeP90 <= 15 && hpP10 >= 18) return 'LOW';
    if (onTimeProb >= 0.6 && overtimeP90 <= 35 && hpP10 >= 10) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * 生成优化建议（基于 entrySlack 分布）
   * 
   * 从"能算风险"升级为"能解释风险 + 不误导用户"的优化建议
   */
  generateOptimizationSuggestions(
    metrics: RobustnessMetrics,
    opts?: {
      bufferMin?: number; // 默认 12
      missProbThreshold?: number; // 默认 0.10
      waitProbThreshold?: number; // 默认 0.30
    }
  ): OptimizationSuggestion[] {
    const bufferMin = opts?.bufferMin ?? 12;
    const missProbThreshold = opts?.missProbThreshold ?? 0.10;
    const waitProbThreshold = opts?.waitProbThreshold ?? 0.30;

    const missByPoi = new Map(
      metrics.perPoiMissProb.map((x) => [x.poiId, x])
    );
    const waitByPoi = new Map(
      metrics.perPoiWaitProb.map((x) => [x.poiId, x])
    );

    const suggestions: OptimizationSuggestion[] = [];

    // 1) 优先处理：MISSED_LAST_ENTRY / slackP90 < 0（高置信"会错过"）
    for (const slack of metrics.perPoiEntrySlack) {
      const miss = missByPoi.get(slack.poiId);
      const missProb = miss?.missProb ?? 0;

      const need =
        missProb >= missProbThreshold ||
        slack.slackP90Min < 0 ||
        slack.slackP50Min < 0;
      if (!need) continue;

      // 用最保守的 P90 来算"要提前多少"
      const targetNeg =
        slack.slackP90Min < 0
          ? slack.slackP90Min
          : slack.slackP50Min < 0
            ? slack.slackP50Min
            : 0;

      const minutes = Math.ceil(Math.max(0, -targetNeg + bufferMin));

      if (minutes >= 10) {
        const dt = slack.deadlineTypeTop?.[0]?.type;
        const dtText =
          dt === 'LAST_ENTRY'
            ? '最晚入场'
            : dt === 'WINDOW_END'
              ? '营业结束'
              : '时间窗';

        suggestions.push({
          type: 'SHIFT_EARLIER',
          poiId: slack.poiId,
          minutes,
          reason: `入场裕量偏紧（P90=${slack.slackP90Min.toFixed(0)}min），主要受${dtText}约束`,
        });

        // 若要提前太多（比如 > 60），提示考虑升级交通
        if (minutes >= 60) {
          suggestions.push({
            type: 'UPGRADE_TRANSIT',
            poiId: slack.poiId,
            reason: `需要提前 ${minutes} 分钟才稳，建议考虑更快交通以减少侵入式改动`,
          });
        }
      }
    }

    // 2) WAIT 风险高：建议调整到"连续开放窗口"或换序避开午休
    for (const w of metrics.perPoiWaitProb) {
      if (w.waitProb < waitProbThreshold) continue;

      suggestions.push({
        type: 'REORDER_AVOID_WAIT',
        poiId: w.poiId,
        reason: `等待概率 ${(w.waitProb * 100).toFixed(0)}%（P90 等待 ${w.waitP90Min}min），建议调整时间段/换序避开分段营业`,
      });
    }

    // 3) 如果完成率 P10 很低：建议整体降密度（这是"全局建议"）
    if (metrics.completionRateP10 < 0.7) {
      suggestions.unshift({
        type: 'REORDER_AVOID_WAIT',
        poiId: 'GLOBAL',
        reason: `完成率 P10=${(metrics.completionRateP10 * 100).toFixed(0)}%，建议整体降低密度或增加 1 次休息/缓冲`,
      } as any);
    }

    // 去重：同 poi SHIFT_EARLIER 只保留一次
    const seen = new Set<string>();
    return suggestions.filter((s) => {
      const key = `${s.type}:${(s as any).poiId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 将某个 POI 及其后续整体前移 N 分钟（最小扰动）
   * 
   * 适合处理 MISSED_LAST_ENTRY/裕量不足 的建议
   */
  private shiftScheduleEarlier(
    schedule: DayScheduleResult,
    poiId: string,
    minutes: number
  ): DayScheduleResult {
    const delta = Math.max(0, Math.floor(minutes));

    if (delta === 0) return schedule;

    // 找到 poi 在 stops 中的位置
    const idx = schedule.stops.findIndex(
      (s) => s.kind === 'POI' && s.id === poiId
    );

    if (idx < 0) return schedule;

    // 从 idx 开始所有 stop 的 start/end 前移 delta（不动之前前缀）
    const stops = schedule.stops.map((s, i) => {
      if (i < idx) return s;

      return {
        ...s,
        startMin: Math.max(0, s.startMin - delta),
        endMin: Math.max(0, s.endMin - delta),
        // transitIn 通常表示"到该 stop 的段"，它会跟着 stop 时间移动，不必改 duration
        // 若你有"绝对时刻"字段（如 departAt），也同步前移
      };
    });

    return { ...schedule, stops };
  }

  /**
   * 和相邻一个 POI 换序（用于降低 WAIT）
   * 
   * 适合处理 WAIT 概率高（分段营业）的建议
   * 
   * V1 交换的是 stop 节点，不重建时间轴，评估结果用于方向性对比。
   */
  private swapWithNeighborPoi(
    schedule: DayScheduleResult,
    poiId: string,
    direction: 'PREV' | 'NEXT'
  ): DayScheduleResult {
    const stops = [...schedule.stops];

    const idx = stops.findIndex((s) => s.kind === 'POI' && s.id === poiId);

    if (idx < 0) return schedule;

    // 找相邻的 POI（跨过 REST/MEAL/TRANSFER 也可以；V1 只找最近的 POI）
    const step = direction === 'PREV' ? -1 : 1;
    let j = idx + step;

    while (j >= 0 && j < stops.length && stops[j].kind !== 'POI') {
      j += step;
    }

    if (j < 0 || j >= stops.length) return schedule;

    // 交换两个 stop 的位置（保持其他 stop 不变）
    const tmp = stops[idx];
    stops[idx] = stops[j];
    stops[j] = tmp;

    // ⚠️ 交换后 start/end 时刻可能不再"连续"，V1 处理：保留原 start/end（最小扰动）
    // 更严谨做法是重建时间轴（V2 做）

    return { ...schedule, stops };
  }

  /**
   * 计算 schedule 的结构签名（用于去重）
   * 
   * 双层签名：
   * - 结构签名（优先）：只看 POI 顺序（和 kind/id）
   * - 时间签名（次级）：用于同结构下去重
   */
  private getScheduleStructureSignature(schedule: DayScheduleResult): string {
    // 结构签名：只看 POI 顺序
    return schedule.stops
      .filter((s) => s.kind === 'POI')
      .map((s) => s.id)
      .join('>');
  }

  private getScheduleTimeSignature(schedule: DayScheduleResult): string {
    // 时间签名：所有 stop 的 start/end
    return schedule.stops
      .map((s) => `${s.kind}:${s.id}:${s.startMin}-${s.endMin}`)
      .join('|');
  }

  /**
   * 检查候选有效性（轻量过滤，不跑 MC）
   * 
   * V1 默认阈值：
   * - SHIFT 变形阈值：clampedToZeroCount > 2 或极端提前（delta > 90 且 minStartMin == 0）
   * - SWAP 时间倒序阈值：倒序超过 30 分钟
   */
  private isValidCandidate(
    candidate: DayScheduleResult,
    base: DayScheduleResult
  ): {
    valid: boolean;
    reason?: string;
    warnings?: Array<'TIMELINE_BROKEN' | 'SHIFT_CLAMPED'>;
  } {
    const warnings: Array<'TIMELINE_BROKEN' | 'SHIFT_CLAMPED'> = [];

    // SHIFT 后若出现 stop.startMin < 0 太多（超过 2 个），判为"变形过大"
    const clampedToZero = candidate.stops.filter((s) => s.startMin === 0 && base.stops.some(bs => bs.id === s.id && bs.startMin > 0)).length;
    const negativeCount = candidate.stops.filter((s) => s.startMin < 0).length;
    
    // 计算 shift delta（如果是从 base 前移的）
    const minStartMin = Math.min(...candidate.stops.map(s => s.startMin).filter(m => m >= 0));
    const firstPoiIdx = candidate.stops.findIndex(s => s.kind === 'POI');
    let shiftDelta = 0;
    if (firstPoiIdx >= 0 && base.stops.length > firstPoiIdx) {
      shiftDelta = base.stops[firstPoiIdx].startMin - candidate.stops[firstPoiIdx].startMin;
    }

    if (clampedToZero > 2 || (minStartMin === 0 && firstPoiIdx > 0 && shiftDelta > 90)) {
      return {
        valid: false,
        reason: `变形过大：${clampedToZero} 个 stop 被夹到 0，或极端提前（delta=${shiftDelta.toFixed(0)}min）`,
      };
    }

    if (clampedToZero > 0) {
      warnings.push('SHIFT_CLAMPED');
    }

    // SWAP 后检查时间倒序（简化检查：连续 POI 是否明显倒序）
    for (let i = 1; i < candidate.stops.length; i++) {
      const prev = candidate.stops[i - 1];
      const curr = candidate.stops[i];
      if (
        prev.kind === 'POI' &&
        curr.kind === 'POI' &&
        curr.startMin < prev.startMin - 30
      ) {
        // 时间轴不连续（V1 限制），但仍可评估，只是 UI 上要提示
        warnings.push('TIMELINE_BROKEN');
        return {
          valid: true,
          reason: '时间轴不连续（V1 限制），仅方向性对比',
          warnings,
        };
      }
    }

    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * 计算差异摘要（deltaSummary）
   * 
   * delta 单位：ratio delta（比例差），UI 显示时转换为 pp = delta * 100
   */
  private calculateDeltaSummary(
    candidate: RobustnessMetrics,
    base: RobustnessMetrics
  ): WhatIfCandidate['deltaSummary'] {
    const missDelta = candidate.timeWindowMissProb - base.timeWindowMissProb;
    const waitDelta = candidate.windowWaitProb - base.windowWaitProb;
    const completionP10Delta =
      candidate.completionRateP10 - base.completionRateP10;
    const onTimeDelta = candidate.onTimeProb - base.onTimeProb;

    // 找出主要改善点（UI 输出统一用 pp = delta * 100）
    let reason: string | undefined;
    const improvements: string[] = [];

    if (missDelta < -0.05) {
      const pp = (-missDelta * 100).toFixed(0);
      improvements.push(
        `错过风险下降 ${pp}pp（最晚入场裕量更充足）`
      );
    }
    if (waitDelta < -0.05) {
      const pp = (-waitDelta * 100).toFixed(0);
      improvements.push(
        `等待风险下降 ${pp}pp（避开分段营业窗口）`
      );
    }
    if (completionP10Delta > 0.05) {
      const pp = (completionP10Delta * 100).toFixed(0);
      improvements.push(
        `完成率 P10 提升 +${pp}pp（SKIP 导致的假稳被修复）`
      );
    }
    if (onTimeDelta > 0.05) {
      const pp = (onTimeDelta * 100).toFixed(0);
      improvements.push(`准点概率提升 +${pp}pp`);
    }

    if (improvements.length > 0) {
      reason = `主要改善：${improvements[0]}`;
      if (improvements.length > 1) {
        reason += `；${improvements.slice(1).join('；')}`;
      }
    }

    return {
      missDelta,
      waitDelta,
      completionP10Delta,
      onTimeDelta,
      reason,
    };
  }

  /**
   * 计算改动幅度量化（impactCost）
   * 
   * severity 规则（互斥且完整覆盖，口径无歧义）：
   * 
   * 关键口径：SHIFT 的"分钟数"必须来自 action.minutes（不是均值推导）
   * 
   * - SWAP 类：poiOrderChanged = true → severity = 'MEDIUM'（固定）
   * - SHIFT 类：令 shiftMinutes = action.minutes
   *   - LOW: shiftMinutes <= 30 && movedStopCount <= 5
   *   - HIGH: shiftMinutes >= 90 OR (shiftMinutes > 60 && movedStopCount > 8)
   *   - MEDIUM: 其他所有情况
   */
  private calculateImpactCost(
    candidate: DayScheduleResult,
    base: DayScheduleResult,
    action?: WhatIfAction
  ): WhatIfCandidate['impactCost'] {
    let timeShiftAbsSumMin = 0;
    let movedStopCount = 0;

    // 检查 POI 顺序是否变化
    const basePoiOrder = base.stops
      .filter((s) => s.kind === 'POI')
      .map((s) => s.id);
    const candidatePoiOrder = candidate.stops
      .filter((s) => s.kind === 'POI')
      .map((s) => s.id);
    const poiOrderChanged = JSON.stringify(basePoiOrder) !== JSON.stringify(candidatePoiOrder);

    // 计算每个 stop 的时间偏移
    // 先建立 base stops 的 ID 到索引的映射（因为顺序可能变了）
    const baseStopMap = new Map<string, typeof base.stops[0]>();
    base.stops.forEach((s) => baseStopMap.set(s.id, s));

    for (const candidateStop of candidate.stops) {
      const baseStop = baseStopMap.get(candidateStop.id);
      if (baseStop) {
        const delta = Math.abs(candidateStop.startMin - baseStop.startMin);
        if (delta > 0) {
          timeShiftAbsSumMin += delta;
          movedStopCount++;
        }
      } else {
        // 新的 stop（不应该发生，但做保护）
        movedStopCount++;
      }
    }

    // 计算 severity（互斥且完整覆盖）
    let severity: 'LOW' | 'MEDIUM' | 'HIGH';

    if (poiOrderChanged) {
      // SWAP 类：固定 MEDIUM
      severity = 'MEDIUM';
    } else {
      // SHIFT 类：shiftMinutes 必须来自 action.minutes（不是均值推导）
      const shiftMinutes = action?.type === 'SHIFT_EARLIER' ? action.minutes : 0;

      if (shiftMinutes >= 90 || (shiftMinutes > 60 && movedStopCount > 8)) {
        severity = 'HIGH';
      } else if (shiftMinutes <= 30 && movedStopCount <= 5) {
        severity = 'LOW';
      } else {
        severity = 'MEDIUM';
      }
    }

    return {
      timeShiftAbsSumMin,
      movedStopCount,
      poiOrderChanged,
      severity,
    };
  }

  /**
   * 计算置信等级（confidence）
   * 
   * 规则（pp 口径，完全无二义）：
   * 
   * 设：
   * - missImprovePp = max(0, -(missDelta) * 100)
   * - completionGainPp = max(0, completionP10Delta * 100)
   * 
   * 则：
   * - HIGH: missImprovePp >= 10 || completionGainPp >= 10
   * - MEDIUM: missImprovePp >= 5 || completionGainPp >= 5
   * - LOW: 否则（改善 < 5pp）
   */
  private calculateConfidence(
    deltaSummary: WhatIfCandidate['deltaSummary']
  ): WhatIfCandidate['confidence'] {
    if (!deltaSummary) {
      return {
        level: 'LOW',
        reason: '改善幅度较小（< 5pp）',
      };
    }

    // 使用 max(0, ...) 确保只计算改善
    const missImprovePp = Math.max(0, -(deltaSummary.missDelta ?? 0) * 100);
    const completionGainPp = Math.max(0, (deltaSummary.completionP10Delta ?? 0) * 100);
    const waitImprovePp = Math.max(0, -(deltaSummary.waitDelta ?? 0) * 100);
    const onTimeGainPp = Math.max(0, (deltaSummary.onTimeDelta ?? 0) * 100);

    // HIGH: missImprovePp >= 10 || completionGainPp >= 10
    if (missImprovePp >= 10 || completionGainPp >= 10) {
      const reasons: string[] = [];
      if (missImprovePp >= 10) reasons.push(`Miss ↓${missImprovePp.toFixed(0)}pp`);
      if (completionGainPp >= 10) reasons.push(`CompletionP10 ↑${completionGainPp.toFixed(0)}pp`);
      return {
        level: 'HIGH',
        reason: reasons.join(', '),
      };
    }

    // MEDIUM: missImprovePp >= 5 || completionGainPp >= 5
    if (missImprovePp >= 5 || completionGainPp >= 5) {
      const reasons: string[] = [];
      if (missImprovePp >= 5) reasons.push(`Miss ↓${missImprovePp.toFixed(0)}pp`);
      if (completionGainPp >= 5) reasons.push(`CompletionP10 ↑${completionGainPp.toFixed(0)}pp`);
      if (waitImprovePp >= 5) reasons.push(`Wait ↓${waitImprovePp.toFixed(0)}pp`);
      if (onTimeGainPp >= 5) reasons.push(`OnTime ↑${onTimeGainPp.toFixed(0)}pp`);
      return {
        level: 'MEDIUM',
        reason: reasons.length > 0 ? reasons.join(', ') : '改善幅度中等',
      };
    }

    // LOW: 否则（改善 < 5pp）
    return {
      level: 'LOW',
      reason: '改善幅度较小（< 5pp）',
    };
  }

  /**
   * 计算改善来源驱动因素（explainTopDrivers）
   * 
   * 重要口径（统一且防 UI 误解）：
   * - deltaPp 表示"改善幅度"（正数，单位 pp），只记录改善，不记录变差
   * - UI 显示方向由 driver 决定：
   *   - MISS / WAIT：展示 ↓{deltaPp}pp
   *   - COMPLETION_P10 / ONTIME：展示 ↑{deltaPp}pp
   * - 排序规则：按 deltaPp 降序，取 Top 3
   */
  private calculateExplainTopDrivers(
    deltaSummary: WhatIfCandidate['deltaSummary']
  ): WhatIfCandidate['explainTopDrivers'] {
    if (!deltaSummary) return undefined;

    const drivers: Array<{
      driver: 'MISS' | 'WAIT' | 'COMPLETION_P10' | 'ONTIME';
      deltaPp: number; // 改善幅度（正数，单位 pp）
    }> = [];

    const missDelta = deltaSummary.missDelta ?? 0;
    const waitDelta = deltaSummary.waitDelta ?? 0;
    const completionDelta = deltaSummary.completionP10Delta ?? 0;
    const onTimeDelta = deltaSummary.onTimeDelta ?? 0;

    // MISS/WAIT：负数才是改善（delta < 0 表示降低，是改善）
    if (missDelta < -0.01) {
      drivers.push({ driver: 'MISS', deltaPp: -missDelta * 100 });
    }
    if (waitDelta < -0.01) {
      drivers.push({ driver: 'WAIT', deltaPp: -waitDelta * 100 });
    }

    // COMPLETION/ONTIME：正数才是改善（delta > 0 表示提升，是改善）
    if (completionDelta > 0.01) {
      drivers.push({ driver: 'COMPLETION_P10', deltaPp: completionDelta * 100 });
    }
    if (onTimeDelta > 0.01) {
      drivers.push({ driver: 'ONTIME', deltaPp: onTimeDelta * 100 });
    }

    // 按 deltaPp 降序排列，取 Top 3
    return drivers.sort((a, b) => b.deltaPp - a.deltaPp).slice(0, 3);
  }

  /**
   * 生成候选方案的稳定 seed（避免不同端实现不一致）
   * 
   * 规则（必须一致）：seedForCandidate = baseSeed + stableHash(candidate.id) % 100000
   * 
   * 这样同一候选在任何地方评估都一致，不会出现"前端算出来和后端不一样"
   * 
   * @param baseSeed base 评估使用的 seed
   * @param candidateId 候选方案的 ID
   * @returns 候选方案的 seed（稳定且可复现）
   */
  getSeedForCandidate(baseSeed: number, candidateId: string): number {
    const seed0 = (Math.floor(baseSeed) || 0) >>> 0;

    let hash = 2166136261 >>> 0; // FNV offset basis
    for (let i = 0; i < candidateId.length; i++) {
      hash ^= candidateId.charCodeAt(i);
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return (seed0 + (hash % 100000)) >>> 0;
  }

  /**
   * 构建 What-If 评估报告
   * 
   * 自动生成 2~3 个候选方案并评估，返回对比报告
   * 
   * @param args.schedule - 原计划（base schedule），会被当成 base candidate 的 schedule 使用
   * @param args.budgetStrategy - 预算策略（可选，默认：base=300, candidates=300, confirm=600）
   */
  async evaluateWhatIfReport(args: {
    policy: PlanningPolicy;
    schedule: DayScheduleResult;
    dayEndMin: number;
    dateISO: string;
    dayOfWeek: DayOfWeek;
    poiLookup: PoiLookup;
    config?: { samples?: number; seed?: number };
    /** 来自优化建议生成：SHIFT_EARLIER / REORDER_AVOID_WAIT（V1 先做前两个） */
    suggestions: OptimizationSuggestion[];
    /** 预算策略（可选） */
    budgetStrategy?: {
      baseSamples?: number;
      candidateSamples?: number;
      confirmSamples?: number;
    };
  }): Promise<WhatIfReport> {
    const {
      policy,
      schedule: baseSchedule,
      dayEndMin,
      dateISO,
      dayOfWeek,
      poiLookup,
    } = args;

    // ===== 0) Resolve budget/meta =====
    // baseSeed 必须使用无符号整数转换，保证可复现
    const baseSeed = (Math.floor(args.config?.seed ?? 42) || 0) >>> 0;

    const baseSamples =
      args.budgetStrategy?.baseSamples ??
      args.config?.samples ??
      300;

    const candidateSamples =
      args.budgetStrategy?.candidateSamples ??
      args.config?.samples ??
      300;

    const confirmSamples =
      args.budgetStrategy?.confirmSamples ?? 600;

    const meta: WhatIfReportMeta = {
      baseSamples,
      candidateSamples,
      confirmSamples,
      baseSeed,
    };

    // ===== 1) Base evaluate (must be reproducible) =====
    const baseMetrics = this.evaluateDayRobustness({
      policy,
      schedule: baseSchedule,
      dayEndMin,
      dateISO,
      dayOfWeek,
      poiLookup,
      config: {
        samples: baseSamples,
        seed: baseSeed, // ✅ base 也显式 seed
      },
    });

    const base: WhatIfCandidate = {
      id: 'BASE',
      title: '原计划',
      description: '当前生成的行程',
      schedule: baseSchedule,
      metrics: baseMetrics,
    };

    const candidates: WhatIfCandidate[] = [];
    // 双层签名去重
    const seenStructureSigs = new Set<string>();
    const baseStructureSig = this.getScheduleStructureSignature(baseSchedule);
    seenStructureSigs.add(baseStructureSig);

    // ===== 2) Build raw candidates (SHIFT/SWAP) =====
    // 来源：suggestions（推荐）或 fallback（无 suggestions 时可根据 metrics 自动生成最小集合）
    const suggestions =
      args.suggestions ??
      this.generateOptimizationSuggestions(baseMetrics);

    const top = suggestions
      .filter((s) => s.type !== 'UPGRADE_TRANSIT') // V1 先不做 UPGRADE_TRANSIT
      .slice(0, 3);

    // 同类策略候选池（用于后续去重和选最优）
    const candidatePool: Array<{
      candidate: WhatIfCandidate;
      action: WhatIfAction;
      signature: string;
      score: number;
    }> = [];

    for (const s of top) {
      if (s.type === 'SHIFT_EARLIER') {
        const schedule2 = this.shiftScheduleEarlier(
          baseSchedule,
          s.poiId,
          s.minutes
        );

        const structureSig = this.getScheduleStructureSignature(schedule2);
        if (seenStructureSigs.has(structureSig)) continue; // 结构去重

        // 有效性筛选
        const valid = this.isValidCandidate(schedule2, baseSchedule);
        if (!valid.valid) continue; // 跳过无效候选

        const candidateId = `SHIFT:${s.poiId}:${s.minutes}`;
        const candidateSeed = this.getSeedForCandidate(baseSeed, candidateId);

        const metrics2 = this.evaluateDayRobustness({
          policy,
          schedule: schedule2,
          dayEndMin,
          dateISO,
          dayOfWeek,
          poiLookup,
          config: {
            samples: candidateSamples, // ✅ 同预算
            seed: candidateSeed, // ✅ 派生 seed
          },
        });

        const deltaSummary = this.calculateDeltaSummary(metrics2, baseMetrics);
        const action: WhatIfAction = {
          type: 'SHIFT_EARLIER',
          poiId: s.poiId,
          minutes: s.minutes,
        };
        const impactCost = this.calculateImpactCost(schedule2, baseSchedule, action);
        const confidence = this.calculateConfidence(deltaSummary);
        const explainTopDrivers = this.calculateExplainTopDrivers(deltaSummary);

        const candidate: WhatIfCandidate = {
          id: candidateId,
          title: `提前 ${s.minutes} 分钟`,
          description: `${s.poiId} 前移 ${s.minutes} 分钟（最小扰动）${valid.reason ? `（${valid.reason}）` : ''}`,
          schedule: schedule2,
          metrics: metrics2,
          deltaSummary,
          scheduleWarnings: valid.warnings,
          impactCost,
          confidence,
          explainTopDrivers,
          action,
        };

        seenStructureSigs.add(structureSig);
        candidatePool.push({
          candidate,
          action,
          signature: structureSig,
          score: 0, // 后续计算
        });
      }

      if (s.type === 'REORDER_AVOID_WAIT') {
        // V1 做两个：和前一个 POI 换 / 和后一个换
        const prev = this.swapWithNeighborPoi(baseSchedule, s.poiId, 'PREV');
        const next = this.swapWithNeighborPoi(baseSchedule, s.poiId, 'NEXT');

        const swaps = [
          { schedule: prev, direction: 'PREV' as const },
          { schedule: next, direction: 'NEXT' as const },
        ];

        for (const swap of swaps) {
          const structureSig = this.getScheduleStructureSignature(swap.schedule);
          if (seenStructureSigs.has(structureSig)) continue; // 结构去重

          // 有效性筛选（SWAP 可能时间轴不连续，但仍可评估）
          const valid = this.isValidCandidate(swap.schedule, baseSchedule);

          const candidateId = `SWAP_${swap.direction}:${s.poiId}`;
          const candidateSeed = this.getSeedForCandidate(baseSeed, candidateId);

          const metrics2 = this.evaluateDayRobustness({
            policy,
            schedule: swap.schedule,
            dayEndMin,
            dateISO,
            dayOfWeek,
            poiLookup,
            config: {
              samples: candidateSamples, // ✅ 同预算
              seed: candidateSeed, // ✅ 派生 seed
            },
          });

          const deltaSummary = this.calculateDeltaSummary(metrics2, baseMetrics);
          const action: WhatIfAction = {
            type: 'SWAP_NEIGHBOR',
            poiId: s.poiId,
            direction: swap.direction,
          };
          const impactCost = this.calculateImpactCost(swap.schedule, baseSchedule, action);
          const confidence = this.calculateConfidence(deltaSummary);
          const explainTopDrivers = this.calculateExplainTopDrivers(deltaSummary);

          const candidate: WhatIfCandidate = {
            id: candidateId,
            title:
              swap.direction === 'PREV'
                ? '换序（与前一个 POI 交换）'
                : '换序（与后一个 POI 交换）',
            description: `尝试通过换序降低等待风险（分段营业/午休）${valid.reason ? `（${valid.reason}）` : ''}`,
            schedule: swap.schedule,
            metrics: metrics2,
            deltaSummary,
            scheduleWarnings: valid.warnings,
            impactCost,
            confidence,
            explainTopDrivers,
            action,
          };

          seenStructureSigs.add(structureSig);
          candidatePool.push({
            candidate,
            action,
            signature: structureSig,
            score: 0,
          });
        }
      }
    }

    // 计算评分
    const score = (m: RobustnessMetrics): number => {
      return (
        m.timeWindowMissProb * 3.0 +
        m.windowWaitProb * 1.5 +
        (1 - m.completionRateP10) * 2.5 +
        (1 - m.onTimeProb) * 1.0
      );
    };

    candidatePool.forEach((item) => {
      item.score = score(item.candidate.metrics);
    });

    // 同类策略去重：同一个 structureSig 只保留 score 最好的一个
    const bestByStructureSig = new Map<string, typeof candidatePool[0]>();
    for (const item of candidatePool) {
      const structureSig = item.signature;
      const existing = bestByStructureSig.get(structureSig);
      if (!existing || item.score < existing.score) {
        bestByStructureSig.set(structureSig, item);
      }
    }

    // 转换为 candidates
    candidates.push(...Array.from(bestByStructureSig.values()).map((item) => item.candidate));

    // 3) 自动挑 winner（两段式：先找"收益最大"，再找"改动最小"）
    const gate = (c: WhatIfCandidate): boolean => {
      const delta = c.deltaSummary;
      if (!delta) return true;

      // 使用更可读的变量名
      const missImprove = -(delta.missDelta ?? 0); // 正数表示改善
      const waitImprove = -(delta.waitDelta ?? 0); // 正数表示改善
      const completionDrop = -(delta.completionP10Delta ?? 0); // 正数表示变差
      const onTimeImprove = delta.onTimeDelta ?? 0; // 正数表示改善

      // Gate 规则 1：若 completionRateP10 比 base 低 > 5pp → 不允许成为 winner
      // （除非 missProb 显著下降，比如 > 15pp）
      if (completionDrop > 0.05 && missImprove < 0.15) {
        return false;
      }

      // Gate 规则 2：若 timeWindowMissProb 比 base 高 → 不允许成为 winner
      // （除非 completionP10 提升很大，比如 > 15pp）
      if (missImprove < 0) {
        const completionGain = delta.completionP10Delta ?? 0;
        if (completionGain < 0.15) {
          return false;
        }
      }

      // Gate 规则 3：如果 candidate 的 riskLevel 比 base 更差，除非它在 completionP10 或 miss 上有显著改善，否则不推荐
      const riskOrder = { LOW: 0, MEDIUM: 1, HIGH: 2 };
      const baseRiskLevel = riskOrder[base.metrics.riskLevel];
      const candidateRiskLevel = riskOrder[c.metrics.riskLevel];
      
      if (candidateRiskLevel > baseRiskLevel) {
        // 风险等级更差，需要显著改善才能推荐
        if (missImprove < 0.15 && (delta.completionP10Delta ?? 0) < 0.15) {
          return false;
        }
      }

      return true;
    };

    const eligible = candidates.filter(gate);

    // 两段式选择（顺序固定，避免不同实现分歧）：
    // 先 Gate：过滤不允许成为 winner 的候选
    // 第一段：在 Gate 通过的候选里，按 benefitScore 找收益最大的 top 2
    // 第二段：在 top 2 中选择 impactCost.severity 更低的作为 winner
    // 若 severity 相同，再用 benefitScore 更高者胜
    let winner: WhatIfCandidate | undefined;

    if (eligible.length > 0) {
      // 计算 benefitScore（score 的反向，越高越好）
      const benefitScore = (m: RobustnessMetrics): number => {
        // 使用 score 的相反数，或直接用改善幅度
        return (
          -(m.timeWindowMissProb * 3.0) -
          m.windowWaitProb * 1.5 +
          m.completionRateP10 * 2.5 +
          m.onTimeProb * 1.0
        );
      };

      // 第一段：找收益最好的 top 2（基于 benefitScore）
      const sortedByBenefit = [...eligible].sort(
        (a, b) => benefitScore(b.metrics) - benefitScore(a.metrics)
      );
      const top2 = sortedByBenefit.slice(0, 2);

      // 第二段：在 top 2 里选 impactCost.severity 更低的
      if (top2.length === 1) {
        winner = top2[0];
      } else if (top2.length === 2) {
        const severityOrder = { LOW: 0, MEDIUM: 1, HIGH: 2 };
        const severity0 = top2[0].impactCost?.severity ?? 'MEDIUM';
        const severity1 = top2[1].impactCost?.severity ?? 'MEDIUM';

        if (severityOrder[severity0] < severityOrder[severity1]) {
          winner = top2[0];
        } else if (severityOrder[severity0] > severityOrder[severity1]) {
          winner = top2[1];
        } else {
          // 若 severity 相同，再用 benefitScore 更高者胜
          winner = benefitScore(top2[0].metrics) >= benefitScore(top2[1].metrics) ? top2[0] : top2[1];
        }
      }
    }

    // ===== 9) risk warning (global) =====
    let riskWarning: WhatIfReport['riskWarning'] = undefined;

    if (winner) {
      const warnMsg = this.getRiskWarning(winner);
      if (warnMsg) {
        riskWarning = { candidateId: winner.id, message: warnMsg };
      }
    }

    // ===== 10) Output report =====
    return {
      base,
      candidates,
      winnerId: winner?.id,
      riskWarning,
      meta, // ✅ 使用已计算的 meta
    };
  }

  /**
   * 应用候选方案（A）候选执行按钮：输出 action 可直接回写到 schedule
   * 
   * UI 点击 "应用该方案" → 直接把 schedule 替换成 candidate.schedule
   * （无需 scheduler 参与）
   */
  applyCandidateSchedule(
    report: WhatIfReport,
    candidateId: string
  ): DayScheduleResult | null {
    const candidate = report.candidates.find((c) => c.id === candidateId);
    if (!candidate || !candidate.action) {
      return null;
    }

    // 直接返回 candidate 的 schedule（已经是最新的计划）
    return candidate.schedule;
  }

  /**
   * 一键复评（B）：应用后再跑一次评估作为确认
   * 
   * 关键口径（强制一致）：
   * - confirm 用更高 samples（默认 600）
   * - confirm seed 使用同一派生规则，保持"候选评估 vs 复评"一致性（差异主要来自 samples 增加，而不是 seed 变化）
   * - 入参统一为 config.seed（避免 baseSeed 命名引起歧义）
   */
  async reEvaluateAfterApply(args: {
    policy: PlanningPolicy;
    appliedSchedule: DayScheduleResult;
    dayEndMin: number;
    dateISO: string;
    dayOfWeek: DayOfWeek;
    poiLookup: PoiLookup;
    /** 复评使用更高的 samples（默认使用 report.meta.confirmSamples 或 600） */
    reEvaluateSamples?: number;
    /** 统一口径：config.seed（建议使用候选派生 seed） */
    config?: { seed?: number };
  }): Promise<RobustnessMetrics> {
    return this.evaluateDayRobustness({
      policy: args.policy,
      schedule: args.appliedSchedule,
      dayEndMin: args.dayEndMin,
      dateISO: args.dateISO,
      dayOfWeek: args.dayOfWeek,
      poiLookup: args.poiLookup,
      config: {
        samples: args.reEvaluateSamples ?? 600, // 更高 samples 用于确认
        seed: args.config?.seed ?? 42, // 统一口径：config.seed
        // 其他配置使用默认值
      },
    });
  }

  /**
   * 获取候选方案的风险提示（C）风险红线提示
   * 
   * 当 severity HIGH 但收益不够大时，提示用户谨慎
   */
  getRiskWarning(candidate: WhatIfCandidate): string | undefined {
    const impact = candidate.impactCost;
    const confidence = candidate.confidence;
    const deltaSummary = candidate.deltaSummary;

    if (!impact || !confidence || !deltaSummary) {
      return undefined;
    }

    const missImprove = -(deltaSummary.missDelta ?? 0) * 100; // pp

    // 当 severity HIGH 但收益不够大时
    if (
      impact.severity === 'HIGH' &&
      confidence.level !== 'HIGH' &&
      missImprove < 10
    ) {
      return '改动较大但收益有限，建议先尝试换序或局部提前（V2 支持）';
    }

    return undefined;
  }
}
