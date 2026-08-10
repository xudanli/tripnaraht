/**
 * Gate 后 Guardians 辩论宿主。
 */

import type { Logger } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type { GateResult, OrchestratorState } from '../interfaces/trip-plan.interface';

export interface GuardiansDebateGateHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly guardiansDebate?: {
    hasFatalViolation: (gate: GateResult) => boolean;
    startShadowIfEligible: (...args: any[]) => void;
    consumeShadowOrMergeWithBudget: (...args: any[]) => Promise<{
      gate: GateResult;
      debate_wait_timed_out: boolean;
    }>;
  };

  buildClarificationResult(
    state: OrchestratorState,
    startTime: number,
    decisionState?: DecisionState,
    context?: AgentContext,
  ): OrchestrationResult;
}

export type { RouteAndRunRequestDto };
