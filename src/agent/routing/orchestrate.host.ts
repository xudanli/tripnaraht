/**
 * ClaudeOrchestrator.orchestrate 入口宿主。
 */

import type { Logger } from '@nestjs/common';
import type { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type { OrchestrateEntryHost } from './orchestrate-entry.host';
import type { DynamicDagHost } from './dynamic-dag.host';

export interface OrchestrateHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly skillsRegistry?: unknown;
  readonly actionRegistry?: unknown;

  getLlmProvider(request: RouteAndRunRequestDto): LlmProvider;
  extractCountryCodeFromMessage(message: string): string | undefined;
  asOrchestrateEntryHost(): OrchestrateEntryHost;
  asDynamicDagHost(): DynamicDagHost;
  /** ROR：按 trip + day 预取当日行程种子（可选） */
  loadRorTripDaySeed?(
    tripId: string,
    dayIndex: number | null,
  ): Promise<import('../reality-observation/observation-seed.builder').TripDaySeed | null>;
  /** ROR：组装含 Weather/Road 的 FetchHost（可选） */
  buildRorObservationFetchHost?(input: {
    seeds?: import('../reality-observation/reality-observation.types').RorSeedFacts;
    cityHint?: string | null;
    dateYmd?: string | null;
    destinationHint?: string | null;
    latitudeDeg?: number | null;
    longitudeDeg?: number | null;
    routeLegs?: import('../reality-observation/route-matrix-ror-loader').RorRouteLegInput[] | null;
    travelMinutesHint?: number | null;
    travelMode?: 'SELF_DRIVE' | 'OTHER' | null;
  }): import('../reality-observation/reality-observation.types').RorFetchHost;

  /**
   * P1 Shadow：统一意图 LLM 消歧（可选）。
   * 仅观测，不得直接改路由；超时/失败应吞掉。
   */
  classifyUnifiedIntentLlmShadow?(input: {
    message: string;
    tripId?: string | null;
    entryPoint?: string | null;
    ruleDecision: import('../intent/unified-intent.types').UnifiedIntentDecision;
  }): Promise<import('../intent/unified-intent.llm-classifier').UnifiedIntentLlmShadowCompare | null>;
}
