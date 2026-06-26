/**
 * Travel Runtime Graph — L3 统一认知模型（非 KG，非 OTA）。
 *
 * Node + Edge + Evidence + Impact
 */

import type { EvidenceEnvelope } from './evidence-envelope.types';
import type { TravelDependencyImpact, TravelImpactNode } from './dependency-graph.types';
import type { TravelEntityRef } from './travel-entity-ref.types';
import type { NonTransactionalReplanResult } from './travel-entity-graph.types';

export const TRAVEL_RUNTIME_GRAPH_VERSION = 'tripnara/travel-runtime-graph/v1' as const;

export type TravelRuntimeEdgeRelation =
  | 'depends_on'
  | 'time_buffer'
  | 'location_coupling'
  | 'blocks'
  | 'delays';

export interface TravelRuntimeEdge {
  from: TravelEntityRef;
  to: TravelEntityRef;
  relation: TravelRuntimeEdgeRelation;
  bufferMinutes?: number;
}

export interface TravelRuntimeNode {
  entity: TravelEntityRef;
  evidence: EvidenceEnvelope[];
  /** 最近一次分析写入的净影响（分钟）；无扰动时为 0 或 undefined */
  netImpactMinutes?: number;
  riskLevel?: TravelImpactNode['riskLevel'];
  cascadeConfidence?: number;
  propagationHop?: number;
}

export interface TravelRuntimeImpact {
  rootEntity: TravelEntityRef;
  rootFactType: EvidenceEnvelope['factType'];
  rootConfidence?: number;
  affected: TravelImpactNode[];
  coverageHint?: string;
}

/** Travel Runtime Graph — 执行态图（非静态知识图） */
export interface TravelRuntimeGraph {
  version: typeof TRAVEL_RUNTIME_GRAPH_VERSION;
  tripId?: string;
  nodes: TravelRuntimeNode[];
  edges: TravelRuntimeEdge[];
  trigger: EvidenceEnvelope;
  impact: TravelRuntimeImpact;
  analyzedAt: string;
}

export function buildTravelRuntimeGraphFromReplan(
  result: NonTransactionalReplanResult,
): TravelRuntimeGraph {
  const nodes: TravelRuntimeNode[] = [
    {
      entity: result.trigger.entityRef,
      evidence: [result.trigger],
      riskLevel: 'LOW',
      cascadeConfidence: result.trigger.confidence,
      propagationHop: 0,
    },
    ...result.impact.affected.map((a) => ({
      entity: a.entityRef,
      evidence: [result.trigger],
      netImpactMinutes: a.netImpactMinutes,
      riskLevel: a.riskLevel,
      cascadeConfidence: a.cascadeConfidence,
      propagationHop: a.propagationHop,
    })),
  ];

  const edges: TravelRuntimeEdge[] = [];
  let prev = result.trigger.entityRef;
  for (const a of result.impact.affected) {
    edges.push({
      from: prev,
      to: a.entityRef,
      relation: 'depends_on',
    });
    prev = a.entityRef;
  }

  return {
    version: TRAVEL_RUNTIME_GRAPH_VERSION,
    tripId: result.tripId,
    nodes,
    edges,
    trigger: result.trigger,
    impact: {
      rootEntity: result.impact.rootEntity,
      rootFactType: result.impact.rootFactType,
      rootConfidence: result.impact.rootConfidence,
      affected: result.impact.affected,
      coverageHint: result.impact.coverageHint,
    },
    analyzedAt: result.analyzedAt,
  };
}
