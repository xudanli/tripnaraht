import type { ActiveRiskCode } from './execution-risk.types';
import type { ExecutionInterventionType } from '../../../mobile/dto/mobile-execution.types';

export type ExecutionRiskClusterSeverity = 'STOP' | 'REPLAN_REQUIRED' | 'AT_RISK';

export interface ExecutionRiskConsequenceImpact {
  code: ActiveRiskCode;
  label: string;
  sourceRiskId: string;
}

/** 同一根因事件聚合 — adjustment-queue 一张主卡的数据源 */
export interface ExecutionRiskCluster {
  clusterId: string;
  tripId: string;

  primaryRiskId: string;
  relatedRiskIds: string[];

  rootCauseCode: ActiveRiskCode;
  /** Package primary knowledge code */
  primaryKnowledgeCode?: string;
  rootCauseKnowledgeCode?: string;
  /** Source event id for environment / road root causes */
  rootEventId?: string;
  /** Derived decision cards folded into this cluster */
  suppressedDecisionCount: number;
  severity: ExecutionRiskClusterSeverity;

  affectedActivityIds: string[];
  affectedMemberIds: string[];

  consequenceCodes: ActiveRiskCode[];
  consequenceImpacts: ExecutionRiskConsequenceImpact[];

  adjustmentType: ExecutionInterventionType;
  requiresUserDecision: boolean;

  decisionProblemId?: string;
  recommendationId?: string;
  environmentEventId?: string;
}
