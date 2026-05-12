/**
 * Execution Simulation Layer：执行前物理世界回放（非规划、非优化）。
 */

export type SimulationIssueType =
  | 'time_overflow'
  | 'overlap_risk'
  | 'late_arrival_risk'
  | 'fatigue_peak'
  | 'walking_overload'
  | 'geo_fragmentation'
  | 'zone_churn'
  | 'backtracking'
  | 'weather_sensitivity'
  | 'queue_risk'
  | 'closure_risk'
  | 'seasonal_variability';

export type SimulationSeverity = 'low' | 'medium' | 'high';

export interface ExecutionSimulationIssue {
  type: SimulationIssueType;
  severity: SimulationSeverity;
  affectedSlots: string[];
  detail?: string;
}

export type ExecutionSimulationRecommendation = 'APPROVE' | 'WARN' | 'REPAIR_REQUIRED';

/** 各维度原始信号（可观测 / 调试） */
export interface ExecutionSimulationDimensions {
  time: {
    totalTravelMinEstimate: number;
    totalVisitMinEstimate: number;
    totalScheduledActiveMin: number;
    /** 超出「合理全日活跃预算」的分钟数（负数为充裕） */
    overflowVsBudgetMin: number;
    compressedSlotsCount: number;
  };
  geo: {
    zoneTransitionCount: number;
    clusterUniqueCount: number;
    backtrackSegments: number;
    fragmentationScore: number;
  };
  fatigue: {
    peakDayScore: number;
    cumulativeWalkingKm: number;
    recoveryGapShortfallMin: number;
    activityDensityPeak: number;
  };
  volatility: {
    weatherSensitivityScore: number;
    queueRiskScore: number;
    closureRiskScore: number;
    seasonalRiskScore: number;
  };
}

export interface ExecutionSimulationReport {
  feasibilityScore: number;
  riskScore: number;
  issues: ExecutionSimulationIssue[];
  predictedExecutionFailureRate: number;
  recommendation: ExecutionSimulationRecommendation;
  dimensions: ExecutionSimulationDimensions;
}
