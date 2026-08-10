/**
 * Lightweight 知识问答对 Orchestrator 的依赖面（helpers 仍可挂在 service 上）。
 */

import type { Logger } from '@nestjs/common';
import type { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { PrismaService } from '../../prisma/prisma.service';
import type {
  OntologyRegionRoadStatusPayload,
} from '../../infrastructure/external/road-is/ontology-road-status-provider.service';
import type { SafetravelGetAdvisoriesOutput } from '../../skills/world/safetravel-get-advisories.skill';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext, OrchestrationResult } from '../interfaces/claude-orchestration.interface';

export interface LightweightKnowledgeHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug'>;
  readonly prisma: PrismaService;
  readonly llmService: {
    callLlmWithSchema: (
      provider: LlmProvider,
      prompt: string,
      schema: unknown,
      opts?: Record<string, unknown>,
    ) => Promise<string>;
  };
  readonly readinessService?: unknown;
  readonly ontologyRoadStatusProvider?: {
    summarizeForOntologyNodeIds: (
      ids: string[],
      opts?: Record<string, unknown>,
    ) => Promise<Map<string, OntologyRegionRoadStatusPayload> | null | undefined>;
  };
  readonly safetravelGetAdvisoriesSkill?: {
    execute: (input: Record<string, unknown>) => Promise<SafetravelGetAdvisoriesOutput>;
  };

  resolveLightweightLlmHttpTimeoutMs(): number;
  resolveTripPromptSummaryForLightweightQa(
    tripId: string,
    request: RouteAndRunRequestDto,
  ): Promise<string | null | undefined>;
  buildDataLookupRagSupplement(...args: any[]): Promise<any>;
  buildLightweightClockFactPromptLines(message: string): string[];
  buildLightweightMacroStatFactPromptLines(): string[];
  coerceLightweightKnowledgeUserVisibleAnswer(...args: any[]): string;
  isCarRentalOrDrivingTravelQuery(msg: string): boolean;
  isPreparationGearTravelQuery(msg: string): boolean;
  lightweightAnswerImpliesMissingTripContext(answer: string): boolean;
  resolveTripnaraStructuredRagBiasForLightweight(...args: any[]): Promise<any>;
  runIcelandRentalGuidanceLightweightBranch(...args: any[]): Promise<any>;
  runLightweightReadinessSupplement(...args: any[]): Promise<any>;
  runLightweightTripHealthSupplement(...args: any[]): Promise<any>;
  runLiveCarRentalSensorBranch(...args: any[]): Promise<any>;
  runLiveFlightSensorBranch(...args: any[]): Promise<any>;
  runLiveHotelSensorBranch(...args: any[]): Promise<any>;
  runLiveActivitySensorBranch(...args: any[]): Promise<any>;
  runLiveRestaurantSensorBranch(...args: any[]): Promise<any>;
  runLiveXhsSensorBranch(...args: any[]): Promise<any>;
  runLiveWeatherSensorBranch(...args: any[]): Promise<any>;
  stripConsultationPromptLeakageFromLightweightAnswer(text: string): string;
  buildLightweightDecisionContextForRealityGate(
    request: RouteAndRunRequestDto,
    tripId: string | undefined,
  ): Promise<any>;
}

export type { AgentContext, OrchestrationResult, RouteAndRunRequestDto, LlmProvider };
