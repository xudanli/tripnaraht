/**
 * Orchestrate 入口分发宿主：实现体仍在 ClaudeOrchestrator，dispatcher 只负责按 mode 调用。
 */

import type { Logger } from '@nestjs/common';
import type { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';

export type OrchestrateEntryDeadline = {
  remainingMs: () => number;
  clamp: (ms: number, minMs?: number) => number;
};

export interface OrchestrateEntryHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug'>;

  runItineraryDayView(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    startTime: number,
  ): Promise<OrchestrationResult>;

  runWorkbenchPlaceholder(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    startTime: number,
  ): Promise<OrchestrationResult>;

  runLightweightKnowledgeQuery(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    deadline: OrchestrateEntryDeadline | undefined,
    llmProvider: LlmProvider,
    startTime: number,
  ): Promise<OrchestrationResult>;

  runTeamStructuredDiscussion(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    userMessage: string,
    startTime: number,
  ): Promise<OrchestrationResult>;

  runPlanningStateMachine(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    deadline: OrchestrateEntryDeadline,
  ): Promise<OrchestrationResult>;
}
