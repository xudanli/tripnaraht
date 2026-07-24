import { ConfigService } from '@nestjs/config';
import type { TripObservationAction } from '../../../trips/road/trip-action.types';
import type { DecisionState } from '../decision-state.types';
import { LlmService } from '../../../llm/services/llm.service';
import type { ObservationExecutionResult, ObservationToolExecutor } from './observation-harness.types';
import { buildTavilyObservationQuery, scoreEvidenceHeuristic, scoreTavilyEvidenceWithLlm, snippetsFromTavily } from './tavily-evidence-scoring';
import { runTavilySearch } from './tavily-search.client';

/**
 * 以 Tavily Search（advanced）为多源聚合后端，可选经 LlmService 做极简证据打分。
 * 启用条件：`OBSERVATION_USE_TAVILY=1` 且配置 `TAVILY_API_KEY`（见 decision-kernel.module 工厂）。
 */
export class TavilyObservationExecutor implements ObservationToolExecutor {
  constructor(
    private readonly config: ConfigService,
    private readonly llm: LlmService,
  ) {}

  async execute(action: TripObservationAction, dso: DecisionState): Promise<ObservationExecutionResult> {
    const apiKey = (this.config.get<string>('TAVILY_API_KEY') || process.env.TAVILY_API_KEY || '').trim();
    if (!apiKey) {
      return {
        evidenceKind: 'stub',
        evidenceWeight: 0,
        summary: 'TAVILY_API_KEY not configured',
      };
    }
    const query = buildTavilyObservationQuery(action, dso);
    const tavily = await runTavilySearch({ apiKey, query });
    const kind = action.type === 'OBSERVATION_SNS_CRAWL' ? 'sns' : 'poi';
    if (this.llm) {
      try {
        return await scoreTavilyEvidenceWithLlm(this.llm, { observationKind: kind, tavily });
      } catch {
        return scoreEvidenceHeuristic(kind, snippetsFromTavily(tavily, 16000));
      }
    }
    return scoreEvidenceHeuristic(kind, snippetsFromTavily(tavily, 16000));
  }
}
