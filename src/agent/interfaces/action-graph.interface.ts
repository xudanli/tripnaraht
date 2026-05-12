import type { ActionType } from '../contracts/action-sideeffect.contract';

export type ActionRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ActionDependencyType =
  | 'MUST_COMPLETE_BEFORE'
  | 'REQUIRES_OUTPUT'
  | 'ROLLBACK_AFTER_FAILURE'
  | 'BLOCK_IF_FAILED';

export interface ContextSignatureV12 {
  signatureId: string;
  physicalHash: string;
  resourceHash: string;
  policyVersion: string;
  generatedAt: string;
  expiresAt: string;
}

export interface ActionNode {
  nodeId: string;
  actionType: ActionType;
  handlerId: string;
  input: Record<string, any>;
  riskLevel: ActionRiskLevel;
  isIrreversible?: boolean;
  requiresUserConfirm?: boolean;
  idempotencyKey: string;
  compensationHandlerId?: string;
}

export interface ActionEdge {
  from: string;
  to: string;
  dependencyType: ActionDependencyType;
}

export interface ActionGraph {
  graphId: string;
  decisionId: string;
  nodes: ActionNode[];
  edges: ActionEdge[];
  contextSignature: ContextSignatureV12;
  createdAt: string;
}

export type ExecutionStageMode = 'SEQUENTIAL' | 'PARALLEL';
export type StageFailurePolicy = 'RETRY' | 'COMPENSATE' | 'BLOCK' | 'MANUAL_REVIEW';

export interface ExecutionStage {
  stageId: string;
  mode: ExecutionStageMode;
  actions: ActionNode[];
  onFailure: StageFailurePolicy;
}

export interface RollbackStep {
  originalActionId: string;
  compensationHandlerId: string;
  order: number;
}

export interface RollbackPlan {
  steps: RollbackStep[];
}

export interface EvidenceRequirement {
  actionId: string;
  requirement: 'HIGH_RISK_EVIDENCE_CARD' | 'FINANCIAL_EVIDENCE_CARD' | 'INVENTORY_EVIDENCE_CARD';
}

export interface ExecutionPlan {
  planId: string;
  graphId: string;
  stages: ExecutionStage[];
  rollbackPlan: RollbackPlan;
  requiredEvidence: EvidenceRequirement[];
  riskLevel: ActionRiskLevel;
  createdAt: string;
}

export interface SagaCompileResult {
  valid: boolean;
  plan?: ExecutionPlan;
  errors: string[];
}
