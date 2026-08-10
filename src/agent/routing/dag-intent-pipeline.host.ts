/**
 * Dynamic DAG 上游管线宿主：Intent / Route / Skills / Plan / Triage。
 * Prompt 构建与 LLM 调用仍挂在 ClaudeOrchestrator。
 */

import type { Logger } from '@nestjs/common';
import type { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  IntentAnalysis,
  RoutingDecision,
  SkillsPlan,
} from '../interfaces/claude-orchestration.interface';
import type {
  OrchestrationStep,
  SubAgentType,
} from '../interfaces/trip-plan.interface';

export interface DagIntentPipelineHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;

  callLlmWithFallback(
    primaryProvider: LlmProvider,
    prompt: string,
    schema: unknown,
    operationName: string,
    tokenContext?: {
      request_id: string;
      state_machine_step: OrchestrationStep;
      sub_agent: SubAgentType;
    },
  ): Promise<string>;

  buildIntentAnalysisPrompt(
    request: RouteAndRunRequestDto,
    context: AgentContext,
  ): string;

  buildRoutingPrompt(intentAnalysis: IntentAnalysis): string;

  buildSkillsSelectionPrompt(
    intentAnalysis: IntentAnalysis,
    routingDecision: RoutingDecision,
    availableSkills: unknown[],
  ): string;

  buildExecutionPlanningPrompt(
    skillsPlan: SkillsPlan,
    routingDecision: RoutingDecision,
  ): string;

  getAvailableSkills(
    emergencyConstraints?: RouteAndRunRequestDto['emergency_constraints'],
  ): Array<{ name: string; description: string }>;
}

export type {
  AgentContext,
  IntentAnalysis,
  RoutingDecision,
  SkillsPlan,
  RouteAndRunRequestDto,
  LlmProvider,
};
