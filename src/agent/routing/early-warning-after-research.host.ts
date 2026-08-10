/**
 * RESEARCH 后 Early Warning 宿主：扫描器 / Kernel / 澄清结果仍挂在 ClaudeOrchestrator。
 */

import type { Logger } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export interface EarlyWarningAfterResearchHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly shadowConflictScanner?: {
    scan: (input: {
      decisionKernel: unknown;
      decisionState: DecisionState | undefined;
      state: OrchestratorState;
      request: RouteAndRunRequestDto;
    }) => Promise<any>;
  };
  readonly decisionKernel?: unknown;
  readonly localCaseStore?: any;

  djb2Fingerprint(payload: unknown): string;
  maybeSnapshot(state: OrchestratorState, trigger: string): void;
  buildClarificationResult(
    state: OrchestratorState,
    startTime: number,
    decisionState?: DecisionState,
    context?: AgentContext,
  ): OrchestrationResult;
}
