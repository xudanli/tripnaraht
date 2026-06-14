/**
 * TravelEntityGraph — TripNARA 内部认知模型（非交易层）。
 *
 * Entity + Fact + Freshness + Dependency + Recommendation
 */

import type { TravelEntityRef } from './travel-entity-ref.types';
import type { EvidenceEnvelope } from './evidence-envelope.types';
import type { CoverageDisclosure } from './coverage-disclosure.types';
import type { TravelDependencyImpact } from './dependency-graph.types';

export interface TravelEntityGraphNode {
  entity: TravelEntityRef;
  facts: EvidenceEnvelope[];
}

export interface TravelEntityGraph {
  version: string;
  nodes: TravelEntityGraphNode[];
  /** 可选：预注册的依赖边（如路网、航班-接驳链） */
  dependencyGraphVersion?: string;
}

/** 非交易型重规划输出 */
export interface NonTransactionalReplanResult {
  tripId?: string;
  /** 根因事实 */
  trigger: EvidenceEnvelope;
  /** 级联影响 */
  impact: TravelDependencyImpact;
  /** 覆盖与边界声明 */
  coverage: CoverageDisclosure;
  /** ISO 8601 */
  analyzedAt: string;
}

/** 产品边界常量 — 写死在类型层，供文档与 lint 引用 */
export const TRIPNARA_PRODUCT_BOUNDARY = {
  doesNotTransact: true,
  doesNotHoldInventory: true,
  doesNotExecuteBooking: true,
  focusesOn: ['route_feasibility', 'risk_assessment', 'replan_recommendation'] as const,
} as const;
