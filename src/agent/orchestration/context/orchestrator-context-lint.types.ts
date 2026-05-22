import type { HarnessStepName } from '../../../harness/contracts/harness-step.types';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';

export type OrchestratorContextLintCode =
  | 'LINT_DISABLED'
  | 'PHASE_RULE_MISSING'
  | 'REQUIRED_INPUT_MISSING'
  | 'DSO_TOP_LEVEL_VIOLATION'
  | 'FORBIDDEN_TRANSIENT_KEY'
  | 'CONTEXT_SIZE_EXCEEDED'
  | 'ORCHESTRATOR_STATE_VIOLATION';

export interface OrchestratorContextLintResult {
  ok: boolean;
  code?: OrchestratorContextLintCode;
  message?: string;
  phase?: HarnessStepName;
  /** 测得的可见载荷字节数（readable 路径投影） */
  payloadBytes?: number;
  violations?: string[];
}

export interface OrchestratorContextLintBeforePhaseOptions {
  requestId?: string;
  orchestratorState?: OrchestratorState;
  /** route_and_run 原始请求体（检测未收敛的体能旁路字段） */
  requestPayload?: Record<string, unknown>;
}

export interface OrchestratorContextLintPhaseRule {
  allowedRead: string[];
  allowedWrite: string[];
  requiredInput: string[];
}
