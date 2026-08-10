/**
 * Dynamic DAG 输入校验宿主：Skill 入参准备 / 澄清文案仍挂在 ClaudeOrchestrator。
 */

import type { Logger } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  ExecutionPlan,
  ExecutionStep,
} from '../interfaces/claude-orchestration.interface';
import type { SkillInputIntentSnapshot } from '../../skills/itinerary/iceland-vehicle-terrain-arbitrator.util';

export type DagValidateResult = {
  valid: boolean;
  missingParams?: string[];
  clarificationMessage?: string;
  solutions?: string[];
};

export interface DagValidateInputsHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;

  readonly skillInputValidator?: {
    validate(
      skillName: string,
      input: Record<string, unknown>,
      metadata?: unknown,
      validationContext?: {
        context: AgentContext;
        request: RouteAndRunRequestDto;
        stepResults?: Record<string, unknown>;
        planSteps?: Array<{ id: string; skillName?: string }>;
      },
    ): {
      valid: boolean;
      missingParams: string[];
    };
  };

  readonly skillsRegistry?: {
    getSkill?: (name: string) => { metadata?: unknown } | undefined;
  };

  buildSkillInputIntentSnapshot(
    request: RouteAndRunRequestDto,
    context: AgentContext,
  ): SkillInputIntentSnapshot | undefined;

  prepareSkillInput(
    step: ExecutionStep,
    results: Record<string, unknown>,
    context: AgentContext,
    request: RouteAndRunRequestDto,
    intentSnapshot?: SkillInputIntentSnapshot,
  ): Record<string, unknown>;

  buildMissingParamClarificationMessage(input: {
    message: string;
    missingParams: string[];
  }): string;

  extractSolutionsFromError(error: { message: string }): string[];

  extractCountryCodeFromMessage(message: string): string | undefined;
}

export type {
  AgentContext,
  ExecutionPlan,
  RouteAndRunRequestDto,
};
