// src/trips/decision/plan-model.ts

/**
 * Plan Model - 可执行的计划输出结构
 * 
 * 贴近现有 days -> timeSlots 结构，增强决策信息
 */

import { ActivityType, GeoPoint, ISODate, ISOTime, TravelLeg } from './world-model';
import type { ExecutionEnrichedTravelLeg } from '../routing/execution/execution-enriched-travel-leg.types';
import type { ObservationIntent } from './observation-intent.types';
import type { TemporalPropagationSnapshot } from './temporal/temporal-propagation.types';

/**
 * 决策引擎在天气管道完成后写入的「逐日执行语义」（供 ETA/daylight/Agent 读取）
 */
export interface PlanDayWeatherExecution {
  executionState?: 'EXECUTABLE' | 'DEGRADED' | 'HIGH_RISK' | 'BLOCKED';
  executionQuality?: {
    safeScore: number;
    delayFactor: number;
    visibilityPenalty: number;
    fatigueCost: number;
    riskBudget: number;
  };
  violation?: 'HARD' | 'SOFT' | 'NONE';
  /** TravelHazard.kind 列表 */
  hazardKinds?: string[];
  crosswindRisk?: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  suggestedAction?: 'DELAY' | 'REROUTE' | 'CANCEL' | 'PROCEED';
  explanation?: string;
  /** 由 delayFactor 推导的当日建议额外驾驶缓冲（分钟）；时间段调整后写入 */
  recommendedExtraDriveMinutes?: number;
  /** ACCUMULATE_GLOBAL_SLACK 类 drift 的当日全日缓冲合计（分钟） */
  accumulatedGlobalSlackMinutes?: number;
}

export interface PlanSlot {
  id: string;
  time: ISOTime;                 // keep your current field
  endTime?: ISOTime;             // optional but strongly recommended
  title: string;
  type: ActivityType;

  poiId?: string;                // link back to ActivityCandidate.id
  coordinates?: GeoPoint;

  // optional enriched details
  travelLegFromPrev?: TravelLeg;
  /**
   * P4-A++：路线走廊物理投影（runtime overlay）。不替换 `travelLegFromPrev`；单一执行语义由此读出。
   */
  routeExecutionOverlay?: ExecutionEnrichedTravelLeg;
  notes?: string;

  // for governance & repair
  locked?: boolean;              // user locked / booked
  priorityTag?: 'anchor' | 'core' | 'optional';
  /** 策略标签：如 aurora_night、night_observation，供极光/夜间观测修复与替换 */
  semanticTags?: string[];
  /**
   * P1+：概率型观测行为本体（极光等）；优先于仅靠 semanticTags 推断。
   */
  observationIntent?: ObservationIntent;
  reasons?: string[];            // explainability
}

export interface PlanDay {
  day: number;
  date: ISODate;
  timeSlots: PlanSlot[];
  // Terrain facts for the day (at least maxElevation/totalAscent for E2E testing)
  terrainFacts?: {
    maxElevation?: number; // 最高海拔（米）
    totalAscent?: number;   // 累计爬升（米）
    minElevation?: number; // 最低海拔（米）
    totalDescent?: number; // 累计下降（米）
    effortLevel?: 'RELAX' | 'MODERATE' | 'CHALLENGE' | 'EXTREME';
    riskFlags?: Array<{
      type: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
      message: string;
    }>;
  };
  /** P2+：该日天气 hazard / 执行质量快照（与 WeatherDecisionEvidence 对齐） */
  weatherExecution?: PlanDayWeatherExecution;
}

export interface TripPlan {
  version: string;               // semantic version of your planner
  createdAt: string;
  days: PlanDay[];

  /** Temporal propagation v0：天气等产生的 TimeDrift + timeline 依赖边 */
  temporal?: TemporalPropagationSnapshot;

  // predicted metrics (for UI / evaluation)
  metrics?: {
    estTotalCost?: number;
    estActiveMinutes?: number;
    estTravelMinutes?: number;
    robustnessScore?: number;    // 0~1
    /** 多日天气执行质量：最大耗时乘数（≥1），用于 ETA 膨胀提示 */
    weatherDelayFactorMax?: number;
    /** 最保守一日的风险预算（0~1） */
    weatherRiskBudgetMin?: number;
    /** 最保守一日的安全分（0~1） */
    weatherSafeScoreMin?: number;
    /** 全行程最差的执行语义态 */
    weatherWorstExecutionState?: 'EXECUTABLE' | 'DEGRADED' | 'HIGH_RISK' | 'BLOCKED';
    /** 在 estTravelMinutes 已估算时，按 weatherDelayFactorMax 校正后的驾驶/转移耗时 */
    estTravelMinutesWeatherAdjusted?: number;
  };
}

