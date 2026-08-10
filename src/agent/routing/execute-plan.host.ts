/**
 * executePlan 路径宿主：Skill/Action 准备与输出合并仍挂在 ClaudeOrchestrator。
 */

import type { Logger } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  ExecutionPlan,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type { SkillInputIntentSnapshot } from '../../skills/itinerary/iceland-vehicle-terrain-arbitrator.util';

export interface ExecutePlanHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly skillsRegistry?: {
    getSkill: (name: string) =>
      | {
          execute: (input: unknown) => Promise<unknown>;
          metadata?: { name?: string; [key: string]: unknown };
        }
      | undefined;
    getAllSkills: () => Array<{ metadata: { name: string } }>;
  };
  readonly actionRegistry?: {
    get: (name: string) =>
      | {
          execute: (input: unknown, state: unknown) => Promise<unknown>;
        }
      | undefined;
  };

  prepareSkillInput(...args: any[]): Promise<any> | any;
  prepareActionInput(...args: any[]): Promise<any> | any;
  mergeSkillOutputWithPlanStateInput(...args: any[]): any;
  sanitizeOrchestrationHandoff(...args: any[]): any;
  generateAnswerText(...args: any[]): string | Promise<string>;
  buildClarificationMessage(...args: any[]): string;
  buildMissingParamClarificationMessage(...args: any[]): string;
  extractSolutionsFromError(...args: any[]): string[];
}

export type {
  AgentContext,
  ExecutionPlan,
  OrchestrationResult,
  RouteAndRunRequestDto,
  SkillInputIntentSnapshot,
};
