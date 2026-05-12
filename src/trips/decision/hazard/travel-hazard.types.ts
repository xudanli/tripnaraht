/**
 * Hazard Semantics Layer（P1）
 *
 * 观测字段不直接在策略层散落比较；统一为 TravelHazard + 执行语义。
 */

/** 车辆类别（影响侧风/阵风语义强度） */
export type VehicleClass = 'SEDAN' | 'SUV_4WD' | 'CAMPERVAN' | 'EV_CAMPERVAN';

export interface VehicleProfile {
  vehicleClass: VehicleClass;
}

/** 危险本体类型（可扩展：洪水/官方预警等后续接入） */
export type TravelHazardKind =
  | 'CROSSWIND'
  | 'GUST_EXTREME'
  | 'WIND_SPEED'
  | 'LOW_VISIBILITY'
  | 'HEAVY_PRECIP'
  | 'WHITEOUT_EMERGENCE';

export type HazardSeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export interface TravelHazardEvidenceMetric {
  metric: string;
  value: number;
  unit: string;
}

/**
 * 结构化危险实例（可追踪到观测指标）
 */
export interface TravelHazard {
  id: string;
  kind: TravelHazardKind;
  severity: HazardSeverityLevel;
  /** 0–1，融合规则与数据完整度 */
  confidence: number;
  /** 对该车型类别特别敏感；缺省表示与车型无关 */
  primaryVehicleSensitivity?: VehicleClass[];
  narrative?: string;
  evidence: TravelHazardEvidenceMetric[];
}

/**
 * 执行状态：非二元 blocked / ok，用于 degraded / high-risk 路径
 */
export type ExecutionState = 'EXECUTABLE' | 'DEGRADED' | 'HIGH_RISK' | 'BLOCKED';

/**
 * 执行质量标量（P2 雏形：供 planner / 日志消费）
 */
export interface ExecutionQualitySummary {
  /** 0–1，越高越安全 */
  safeScore: number;
  /** 相对无风险基准的行程耗时乘数 */
  delayFactor: number;
  /** 0–1，能见度代价 */
  visibilityPenalty: number;
  /** 0–1，与体力/节奏相关的预留成本（天气侧占位） */
  fatigueCost: number;
  /** 剩余可接受风险预算 */
  riskBudget: number;
}
