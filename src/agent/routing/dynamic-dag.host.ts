/**
 * DYNAMIC_DAG 路径宿主：Triage / Intent / Route / Skills / executePlan。
 */

import type { Logger } from '@nestjs/common';
import type { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  IntentAnalysis,
  OrchestrationResult,
  RoutingDecision,
  SkillsPlan,
} from '../interfaces/claude-orchestration.interface';

export interface DynamicDagHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly skillsRegistry?: {
    getSkill?: (name: string) => { metadata?: Record<string, unknown> } | undefined;
  };

  runOrchestrationTriage(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
    emergencyConstraints?: unknown,
  ): Promise<{
    intentAnalysis: IntentAnalysis;
    routingDecision: RoutingDecision;
    skillsPlan: SkillsPlan;
  } | null>;

  analyzeIntent(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<IntentAnalysis>;

  decideRouting(
    intentAnalysis: IntentAnalysis,
    llmProvider: LlmProvider,
    requestId: string,
  ): Promise<RoutingDecision>;

  selectSkills(...args: any[]): Promise<SkillsPlan>;

  planExecution(...args: any[]): Promise<any>;

  validateSkillsInputs(...args: any[]): Promise<{
    valid: boolean;
    clarificationMessage?: string;
    missingParams?: string[];
    solutions?: string[];
  }>;

  validatePlanInputs(...args: any[]): Promise<{
    valid: boolean;
    clarificationMessage?: string;
    missingParams?: string[];
    solutions?: string[];
  }>;

  buildMissingParamClarificationMessage(input: {
    message: string;
    missingParams: string[];
  }): string;

  injectWebBrowseUrlIfMissing(skillsPlan: SkillsPlan, request: RouteAndRunRequestDto): void;

  extractCountryCodeFromMessage(message: string): string | undefined;

  buildSkillInputIntentSnapshot(request: RouteAndRunRequestDto, context: AgentContext): unknown;

  executePlan(...args: any[]): Promise<OrchestrationResult>;
}
