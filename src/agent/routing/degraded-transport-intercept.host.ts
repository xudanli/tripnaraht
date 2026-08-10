/**
 * transport 降级 ClarifyEndpoints 拦截宿主。
 */

import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export interface DegradedTransportInterceptHost {
  maybeSnapshot(state: OrchestratorState, trigger: string): void;
  buildClarificationResult(
    state: OrchestratorState,
    startTime: number,
    decisionState?: DecisionState,
    context?: AgentContext,
  ): OrchestrationResult;
}
