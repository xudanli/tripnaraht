/**
 * 编排终态结果构建宿主：Harness / Memory / Trajectory / Metrics 仍挂在 ClaudeOrchestrator。
 */

import type { Logger } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { ClarificationQuestion } from '../interfaces/clarification.interface';

export interface OrchestrationResultBuildersHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly agentMemoryContextStore?: any;
  readonly promMetrics?: any;
  readonly localCaseStore?: any;
  readonly cbrAggregator?: any;
  readonly decisionTrajectoryInterlocutor?: {
    markFailed: (requestId: string) => Promise<unknown>;
  };

  stampRecoveryOntoOrchestratorDecisionLogs(
    context: AgentContext | undefined,
    state: OrchestratorState,
  ): void;
  finalizeHarnessTraceFromOrchestration(
    decisionState: DecisionState | undefined,
    status: string,
  ): void;
  persistDecisionTrajectoryAtOrchestrationExit(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
    answerText: string,
  ): Promise<void>;
  resolveClarificationIntroAnswerText(state: OrchestratorState): string;
  buildUserFacingAnswerText(state: OrchestratorState): string;
  formatClarificationMessage(
    questions: ClarificationQuestion[],
    locale?: string,
  ): string;
  normalizeDecisionOsAuditReport(auditReport: unknown): any;
}
