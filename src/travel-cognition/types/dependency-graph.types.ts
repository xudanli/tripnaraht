/**
 * DependencyGraph — 事实/实体间的级联影响（非交易型重规划）。
 *
 * 例：航班延误 → 接驳风险 → 入住风险 → 当日路线风险
 * 只做影响分析与建议，不执行预订/改签。
 */

import type { TravelEntityRef } from './travel-entity-ref.types';
import type { TravelFactType } from './evidence-envelope.types';

export type ImpactRecommendationKind =
  | 'AVOID'
  | 'ADJUST'
  | 'DELAY'
  | 'REPLACE'
  | 'ASK_USER';

export type ImpactRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** 依赖边：source 变化 propagates 到 target */
export interface TravelDependencyEdge {
  source: TravelEntityRef;
  target: TravelEntityRef;
  /** 触发事实类型（如 FLIGHT_STATUS 变化） */
  triggerFactType?: TravelFactType;
  /** 机器可读关系，如 flight_delay_cascades_to_transfer */
  relation: string;
}

export interface TravelImpactNode {
  entityRef: TravelEntityRef;
  riskLevel: ImpactRiskLevel;
  message: string;
  recommendation: ImpactRecommendationKind;
  /** 需用户自行确认的预订/改签事项（TripNARA 不代执行） */
  userConfirmationRequired?: string[];
}

/** 级联影响分析结果 */
export interface TravelDependencyImpact {
  rootEntity: TravelEntityRef;
  rootFactType: TravelFactType;
  affected: TravelImpactNode[];
  /** 覆盖声明应随影响分析一并输出 */
  coverageHint?: string;
}

export interface TravelDependencyGraph {
  version: string;
  edges: TravelDependencyEdge[];
}
