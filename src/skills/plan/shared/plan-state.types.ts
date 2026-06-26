// src/skills/plan/shared/plan-state.types.ts
/**
 * PlanState - 规划工作台的唯一真相
 * 
 * 这是规划工作台的核心数据结构，用于版本管理、diff、回滚
 */

import { WorldModelContext } from '../../../trips/decision/shared/world-model.types';
import { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';

/**
 * 规划约束
 */
export interface PlanConstraints {
  /** 时间约束 */
  time: {
    days: number;
    startDate?: string; // ISODate
    endDate?: string; // ISODate
    availableHoursPerDay?: number;
  };
  
  /** 预算约束 */
  budget: {
    total?: number;
    currency?: string;
    categories?: {
      transportation?: number;
      accommodation?: number;
      food?: number;
      tickets?: number;
      experiences?: number;
      buffer?: number;
    };
  };
  
  /** 体力约束 */
  fitness: {
    level?: 'low' | 'medium' | 'high';
    maxDailyAscentM?: number;
    maxDailyDistanceKm?: number;
    restDayFrequency?: number; // 每 N 天一个休息日
  };
  
  /** 交通偏好 */
  travelMode?: 'self_drive' | 'public_transit' | 'walking' | 'mixed';
  
  /** 住宿偏好 */
  accommodation?: {
    level?: 'budget' | 'mid' | 'luxury';
    type?: string[];
  };
  
  /** 必去/必避 */
  mustDo?: string[];
  mustAvoid?: string[];
  
  /** 同伴信息 */
  companions?: {
    count?: number;
    ages?: number[];
    specialNeeds?: string[];
  };
}

/**
 * POI 信息（从 Place 表获取）
 */
export interface SkeletonPoi {
  /** Place ID */
  placeId: number;
  
  /** Place UUID */
  placeUuid: string;
  
  /** POI 名称（中文） */
  nameCN: string;
  
  /** POI 名称（英文） */
  nameEN?: string;
  
  /** POI 类别 */
  category: 'ATTRACTION' | 'RESTAURANT' | 'HOTEL' | 'SHOPPING' | 'TRANSIT_HUB' | 'HOSPITAL';
  
  /** 地址 */
  address?: string;
  
  /** 评分（0-5） */
  rating?: number;
  
  /** 描述 */
  description?: string;
  
  /** 坐标 */
  coordinates?: {
    lat: number;
    lng: number;
  };
  
  /** 优先级（用于排序和推荐） */
  priority?: 'anchor' | 'core' | 'optional';
  
  /** 其他元数据 */
  metadata?: Record<string, any>;
}

/**
 * 行程骨架（Skeleton）
 */
export interface PlanSkeleton {
  /** 骨架 ID */
  id: string;
  
  /** 骨架名称（紧凑/均衡/松弛） */
  name: string;
  
  /** 每天主题 */
  dayThemes: Array<{
    day: number;
    theme: string;
    description?: string;
  }>;
  
  /** 锚点（关键城市/关键活动） */
  anchors: Array<{
    day: number;
    location: string;
    activity: string;
    priority: 'anchor' | 'core' | 'optional';
  }>;
  
  /** 移动日 */
  transferDays: Array<{
    day: number;
    from: string;
    to: string;
    mode?: string;
  }>;
  
  /** 每天的 POI 列表（住宿、餐厅、景点） */
  pois?: Array<{
    day: number;
    /** 住宿 POI */
    accommodation?: SkeletonPoi;
    /** 餐厅 POI 列表（早餐、午餐、晚餐） */
    restaurants?: Array<{
      meal: 'breakfast' | 'lunch' | 'dinner';
      poi: SkeletonPoi;
    }>;
    /** 景点 POI 列表 */
    attractions?: SkeletonPoi[];
  }>;
  
  /** 取舍理由 */
  rationale: {
    philosophy: string; // 路线哲学
    tradeoffs: string[]; // 取舍说明
    strengths: string[];
    weaknesses: string[];
  };
}

/**
 * 跨城段（Transfer Segment）
 */
export interface TransferSegment {
  /** 段 ID */
  id: string;
  
  /** 起点 */
  from: {
    city: string;
    coordinates?: [number, number];
  };
  
  /** 终点 */
  to: {
    city: string;
    coordinates?: [number, number];
  };
  
  /** 可达性状态 */
  feasibility: 'feasible' | 'needs_confirmation' | 'infeasible';
  
  /** 风险标记 */
  riskFlags: Array<{
    type: 'last_train' | 'tight_connection' | 'night_arrival' | 'weather' | 'other';
    severity: 'low' | 'medium' | 'high';
    description: string;
  }>;
  
  /** 可用交通方式 */
  availableModes?: Array<{
    mode: 'flight' | 'train' | 'bus' | 'self_drive' | 'other';
    time: number; // 分钟
    cost: number;
    reliability: 'high' | 'medium' | 'low';
    effort: 'low' | 'medium' | 'high';
    recommendation?: string;
  }>;
}

/**
 * 时间窗（Time Window）
 */
export interface TimeWindow {
  day: number;
  start: string; // ISOTime
  end: string; // ISOTime
  bufferPolicy: 'conservative' | 'standard' | 'aggressive';
}

/**
 * 疲劳评分
 */
export interface FatigueScore {
  paceScore: number; // 0-100
  fatigueDrivers: Array<{
    type: 'early_morning' | 'long_transfer' | 'cumulative_ascent' | 'long_walk' | 'other';
    severity: number; // 0-100
    description: string;
  }>;
  suggestedRestPoints: Array<{
    day: number;
    reason: string;
  }>;
}

/**
 * 预算拆分
 */
export interface BudgetBreakdown {
  categories: Array<{
    category: 'transportation' | 'accommodation' | 'food' | 'tickets' | 'experiences' | 'buffer';
    min: number;
    max: number;
    estimated: number;
    assumptions: string[];
  }>;
  confidence: 'low' | 'medium' | 'high';
  assumptions: string[];
}

/**
 * 超支检测
 */
export interface OverrunDetection {
  overrunAmount: number;
  overrunDrivers: Array<{
    category: string;
    amount: number;
    reason: string;
  }>;
}

/**
 * 门控状态
 */
export interface GateStatus {
  status: 'ALLOW' | 'NEED_CONFIRM' | 'SUGGEST_REPLACE' | 'REJECT';
  reasons: string[];
  missingEvidence: string[];
  guardianResults?: {
    abu: {
      verdict: 'ALLOW' | 'REJECT';
      evidence: string[];
    };
    drdre: {
      verdict: 'ALLOW' | 'ADJUST' | 'REJECT';
      evidence: string[];
    };
    neptune: {
      verdict: 'ALLOW' | 'REPLACE' | 'REJECT';
      evidence: string[];
    };
  };
  consolidatedVerdict?: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT';
  requiredUserConfirmations?: string[];
}

/**
 * 证据信封（Evidence Envelope）
 */
export interface EvidenceEnvelope {
  source_title: string;
  source_url?: string;
  publisher?: string;
  published_at?: string;
  retrieved_at: string;
  excerpt: string;
  relevance: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  data_timestamp?: string;
}

/**
 * 冲突检测
 */
export interface ConflictDetection {
  conflicts: Array<{
    type: 'budget' | 'time' | 'pace' | 'feasibility' | 'other';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    affectedDays?: number[];
    affectedSegments?: string[];
  }>;
}

/**
 * 决策日志引用
 */
export interface DecisionLogRef {
  decision_id: string;
  diff: any;
  evidence_refs: string[];
  rule_version: string;
  timestamp: string;
}

/**
 * PlanState - 规划工作台的唯一真相
 */
export interface PlanState {
  /** 计划 ID */
  plan_id: string;
  
  /** 计划版本 */
  plan_version: number;
  
  /** 约束 */
  constraints: PlanConstraints;
  
  /** 行程（day → blocks → segments） */
  itinerary: RoutePlanDraft;
  
  /** 移动性（跨城段、换乘点、可达性状态） */
  mobility: {
    transferSegments: TransferSegment[];
    transferGraph?: any; // 可达图
  };
  
  /** 预算（拆分、估算区间、超支来源） */
  budget: {
    breakdown?: BudgetBreakdown;
    overrun?: OverrunDetection;
  };
  
  /** 节奏（时间窗、疲劳评分、休息点） */
  pace: {
    timeWindows?: TimeWindow[];
    fatigueScore?: FatigueScore;
    restPoints?: number[];
  };
  
  /** 门控（状态、原因、需确认点、替代方案引用） */
  gate: GateStatus;
  
  /** 证据引用列表 */
  evidence_refs: EvidenceEnvelope[];
  
  /** 决策日志引用列表 */
  decision_log_refs: DecisionLogRef[];
  
  /** 状态 */
  status: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
  
  /** 世界模型上下文（引用） */
  world?: WorldModelContext;
  
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * PlanContext - 规划上下文（输入）
 */
export interface PlanContext {
  /** 目的地 */
  destination: {
    country?: string;
    city?: string;
    region?: string;
  };
  
  /** 天数 */
  days: number;
  
  /** 交通模式 */
  travelMode?: 'self_drive' | 'public_transit' | 'walking' | 'mixed';
  
  /** 必去/必避 */
  mustDo?: string[];
  mustAvoid?: string[];
  
  /** 约束 */
  constraints?: Partial<PlanConstraints>;
  
  /** 现有 PlanState（如果有） */
  existingPlanState?: PlanState;
}

/**
 * PlanSkeletonSet - 行程骨架方案集
 */
export interface PlanSkeletonSet {
  options: PlanSkeleton[];
  recommendation?: {
    optionId: string;
    reason: string;
  };
}

/**
 * 方案对比维度
 */
export interface OptionComparison {
  options: Array<{
    optionId: string;
    scores: {
      executability: number; // 0-100
      cost: number; // 0-100 (越低越好)
      fatigue: number; // 0-100 (越低越好)
      experienceDensity: number; // 0-100
      risk: number; // 0-100 (越低越好)
      freedom: number; // 0-100
    };
    summary: string;
  }>;
  recommendation?: {
    optionId: string;
    reason: string;
  };
  /** P3: 多方案并行 Kernel GATE_EVAL 增量（shadow/native 模式） */
  kernelGateEval?: {
    optionDeltas: Array<{
      optionId: string;
      optionName?: string;
      gateStatus: GateStatus['status'];
      kernelGateResult: string;
      violationCount: number;
      violationTypes: string[];
      topReasons: string[];
      guardiansAllowed?: boolean;
      expectedUtility?: number;
    }>;
    recommendedByGate?: string;
    divergesFromLlmRecommendation?: boolean;
    llmRecommendedOptionId?: string;
    appliedAt: string;
  };
}
