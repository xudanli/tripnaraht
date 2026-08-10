/**
 * CGUS Optimization Policy — 合同投影快照（How optimizer behaves this run）。
 *
 * Contract = Why / What user wants
 * Policy   = How optimizer behaves this run（硬边界 / 软偏好 / 授权三分）
 * Trace    = What optimizer actually did
 *
 * 原则：
 * - 不要「合同字段 → CGUS weight」硬映射
 * - 硬边界 → Feasible Set；软偏好 → Scoring Policy；授权 → Execution Authority（不参与评分）
 * - OPTIMIZE 只吃本快照，勿动态读最新合同
 */

export const CGUS_OPTIMIZATION_POLICY_SCHEMA_ID =
  'tripnara.cgus_optimization_policy@v1' as const;

export const CGUS_OPTIMIZATION_POLICY_VERSION = 1 as const;

export type CgusPolicySource =
  | 'travel_decision_contract'
  | 'decision_state_hints'
  | 'defaults'
  | 'mixed';

export type CgusHardConstraintKind =
  | 'VEHICLE_TYPE'
  | 'F_ROAD_FORBIDDEN'
  | 'MAX_DAILY_DRIVE_HOURS'
  | 'LOCKED_ACTIVITY'
  | 'CHANGE_STRATEGY_CAP'
  | 'OTHER';

export type CgusSoftObjectiveKind =
  | 'PACE'
  | 'FEWER_HOTEL_CHANGES'
  | 'BUDGET'
  | 'COVERAGE'
  | 'SAFETY'
  | 'CORE_EXPERIENCE'
  | 'FLEXIBILITY'
  | 'PHOTOGRAPHY'
  | 'FAMILY_COMFORT'
  | 'OTHER';

export type CgusSoftIntensity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface CgusHardConstraintSpec {
  id: string;
  kind: CgusHardConstraintKind;
  params?: Record<string, unknown>;
  source: string;
}

export interface CgusSoftObjectiveSpec {
  id: string;
  kind: CgusSoftObjectiveKind;
  intensity: CgusSoftIntensity;
  source: string;
}

/**
 * 执行授权：只决定能否自动落地，永不进入 CGUS 评分。
 */
export interface CgusExecutionAuthoritySpec {
  defaultLevel: string;
  confirmationRequired: string[];
  autoAllowed: string[];
  automationPaused?: boolean;
  scoringExcluded: true;
}

/**
 * 派生评分倾向（非权重表）。由软目标推导，供 preferenceScore / 体验路由微调。
 */
export interface CgusScoringHints {
  fatigueSensitivity?: number;
  densityPreference?: 'relaxed' | 'balanced' | 'dense';
  costSensitivity?: number;
  hotelChangeSensitivity?: number;
  coverageBias?: number;
  safetyBias?: number;
}

export interface CgusPolicyProvenance {
  contractPresent: boolean;
  rankedPrinciples: string[];
  changeStrategyArchetype?: string;
  vehicleType?: '2WD' | '4WD';
  fRoadAllowed?: boolean;
  pace?: string;
  maxDailyDriveHours?: number;
}

export interface CGUSOptimizationPolicy {
  schemaId: typeof CGUS_OPTIMIZATION_POLICY_SCHEMA_ID;
  policyVersion: typeof CGUS_OPTIMIZATION_POLICY_VERSION;
  contractVersion: number;
  policySource: CgusPolicySource;
  projectedAt: string;
  hardConstraints: CgusHardConstraintSpec[];
  softObjectives: CgusSoftObjectiveSpec[];
  executionAuthority: CgusExecutionAuthoritySpec;
  scoringHints: CgusScoringHints;
  provenance: CgusPolicyProvenance;
}
