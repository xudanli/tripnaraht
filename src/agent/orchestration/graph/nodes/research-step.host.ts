/**
 * RESEARCH fallback step 宿主（Skills / Domain Agents / 预测服务）。
 */

import type { Logger } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type {
  OrchestratorState,
  OrchestrationStep,
  SubAgentType,
} from '../../../interfaces/trip-plan.interface';

export interface ResearchStepHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly skillsRegistry?: {
    getSkill: (name: string) => { execute: (input: any) => Promise<any> } | undefined;
  };
  readonly researchPriorSnapshot?: {
    load: (request: RouteAndRunRequestDto) => Promise<Record<string, unknown> | null | undefined>;
    save: (request: RouteAndRunRequestDto, data: Record<string, unknown>) => Promise<void>;
  };
  readonly contextSlidingWindow: {
    slice: (key: string, messages: unknown) => unknown;
  };
  /** Open-world discovery 等路径需要完整 LlmService 表面，此处放宽为 any */
  readonly llmService?: any;
  readonly geoAgent?: any;
  readonly weatherAgent?: any;
  readonly costAgent?: any;
  readonly weatherPredictionService?: any;
  readonly failureRiskPredictionService?: any;

  generateDecisionStepForStep(
    state: OrchestratorState,
    step: OrchestrationStep,
    actor: SubAgentType,
  ): Promise<void>;
}

export type { RouteAndRunRequestDto, AgentContext, OrchestratorState, DecisionState };
