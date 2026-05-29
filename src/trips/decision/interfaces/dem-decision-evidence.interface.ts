// src/trips/decision/interfaces/dem-decision-evidence.interface.ts
/**
 * DEM Decision Evidence Interface
 * 
 * PART 2: DEM 升级为「否决级证据源」
 * 
 * 强制规则（写进代码，不写进文档）：
 * ❌ 没有 DEM evidence → plan 不可 finalize
 * ❌ Neptune 不允许修复没有 DEM evidence 的 segment
 * ❌ Abu 不允许忽略 HARD violation
 */

/**
 * DEM 决策证据
 * 
 * 这是第一类证据（强制），用于否决或修正计划
 */
export interface DemDecisionEvidence {
  /** 路段 ID（用于关联到具体路段） */
  segmentId: string;
  /** 海拔剖面（米） */
  elevationProfile: number[];
  /** 累计爬升（米） */
  cumulativeAscent: number;
  /** 最大坡度（百分比） */
  maxSlopePct: number;
  /** 3天滚动窗口累计爬升（米）- 用于连续疲劳检测 */
  rollingAscent3Days: number;
  /** 疲劳指数（0-100，归一化） */
  fatigueIndex: number;
  /** 违规类型 */
  violation: 'HARD' | 'SOFT' | 'NONE' | 'UNKNOWN';
  /** 解释（用于可解释失败） */
  explanation: string;
  /** 数据源契约（占位符 DEM 不得视为 NONE 违规） */
  dataProvenance?: 'NONE' | 'LIVE' | 'STATIC_INFERRED' | 'PLACEHOLDER';
  /** 额外元数据 */
  metadata?: {
    /** 连续高海拔天数 */
    consecutiveHighAltitudeDays?: number;
    /** 平均坡度（百分比） */
    avgSlopePct?: number;
    /** 距离（米） */
    distanceM?: number;
    /** 海拔变化范围（米） */
    elevationRange?: {
      min: number;
      max: number;
    };
    /** 关键断点（如过陡段起始位置） */
    criticalBreakpoints?: Array<{
      distance: number;
      reason: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
    }>;
  };
}

/**
 * 走廊质量评分
 * 
 * PART 2.2: 走廊质量评分（真正决定路线优劣）
 * 
 * corridorScore =
 *   viewExposureScore * 0.4
 * + elevationVariance * 0.3
 * - slopePenalty * 0.3
 */
export interface CorridorQualityScore {
  /** 总评分（0-100） */
  totalScore: number;
  /** 观景暴露度评分（0-100） */
  viewExposureScore: number;
  /** 海拔变化评分（0-100）- 变化越大越好（避免单调） */
  elevationVariance: number;
  /** 坡度惩罚（0-100）- 坡度越大惩罚越高 */
  slopePenalty: number;
  /** 解释 */
  explanation: string;
}

/**
 * 连续疲劳检测结果
 * 
 * PART 2.1: 连续疲劳（Rolling Window）——这是护城河
 */
export interface RollingFatigueDetection {
  /** 是否检测到连续疲劳 */
  detected: boolean;
  /** 疲劳开始日期（从1开始） */
  startDay?: number;
  /** 疲劳结束日期（从1开始） */
  endDay?: number;
  /** 3天滚动窗口累计爬升（米） */
  rollingAscent3Days: number;
  /** 用户阈值（米） */
  userThreshold: number;
  /** 建议操作 */
  suggestedAction: 'INSERT_REST_DAY' | 'SPLIT_DAYS' | 'REDUCE_ASCENT' | 'NONE';
  /** 解释 */
  explanation: string;
}

/**
 * DEM 证据管道输出
 */
export interface DemEvidencePipelineResult {
  /** 所有路段的证据 */
  segmentEvidences: DemDecisionEvidence[];
  /** 是否有 HARD violation */
  hasHardViolation: boolean;
  /** 是否有 SOFT violation */
  hasSoftViolation: boolean;
  /** 连续疲劳检测结果 */
  rollingFatigue?: RollingFatigueDetection;
  /** 走廊质量评分（如果适用） */
  corridorQuality?: CorridorQualityScore;
  /** 总体可解释失败说明 */
  explainableFailure?: {
    reason: string;
    affectedDays: number[];
    userImpact: string;
  };
  /** 是否可以通过（没有 HARD violation） */
  canProceed: boolean;
}
