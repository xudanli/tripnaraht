import type { TripObservationAction } from '../../../trips/road/trip-action.types';
import type { DecisionState, EnvironmentState, ObservationRecommendation } from '../decision-state.types';

export type ObservationEvidenceKind =
  | 'recent_social_image'
  | 'station_forecast'
  | 'poi_operator'
  | 'stub';

export interface ObservationExecutionResult {
  evidenceKind: ObservationEvidenceKind;
  /** 路段可通行性 [0,1]，越低越差 */
  passability01?: number;
  /** POI 是否对访客开放（核验类） */
  poiOpen?: boolean;
  /** 证据强度 [0,1]，影响信念融合权重 */
  evidenceWeight: number;
  /** 实测不可行（如 SNS 显示大雪封路） */
  routeSegmentInfeasible?: boolean;
  /** 与不可行相关的 POI / 走廊 id */
  affectedPoiIds?: string[];
  /** 人读摘要，写入 researchData */
  summary?: string;
  /** 多源结论互相矛盾（用于下调 evidenceWeight；后续可映射为 DilemmaElicitation） */
  evidenceContradiction?: boolean;
}

export interface ObservationHarnessAuditEntry {
  recommendation: ObservationRecommendation;
  execution: ObservationExecutionResult;
  at: string;
}

export interface ObservationHarnessOutcome {
  /** 合并进 `researchData` */
  researchDataPatch: Record<string, unknown>;
  /** 合并进 `environmentState` */
  environmentPatch?: Partial<EnvironmentState>;
  /** 写入 `userIntent.excludePoiIds`，驱动后续 PLAN_GEN 绕行 */
  excludedPoiIds?: string[];
  /** 信念粒子环境摘要融合（在 Kernel 生成粒子后应用） */
  passabilityEvidence?: { passability01: number; evidenceWeight: number };
  audit: ObservationHarnessAuditEntry[];
  /** 采纳的观测动作（VOI 门槛之上） */
  executedActions: TripObservationAction[];
}

export interface ObservationToolExecutor {
  execute(action: TripObservationAction, dso: DecisionState): Promise<ObservationExecutionResult>;
}
