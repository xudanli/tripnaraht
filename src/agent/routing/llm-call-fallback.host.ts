/**
 * LLM 降级调用 / Token 打点宿主。
 */

import type { Logger } from '@nestjs/common';
import type { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { OrchestrationStep, SubAgentType } from '../interfaces/trip-plan.interface';

export type LlmTokenContext = {
  request_id: string;
  state_machine_step: OrchestrationStep;
  sub_agent: SubAgentType;
};

export interface LlmCallFallbackHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly llmService: {
    callLlmWithSchema: (
      provider: LlmProvider,
      prompt: string,
      schema: any,
      tokenContext?: LlmTokenContext,
    ) => Promise<string>;
  };
  readonly tokenStatsService?: {
    recordTokenUsage: (input: Record<string, unknown>) => Promise<void>;
  };

  getFallbackProviders(primaryProvider: LlmProvider): LlmProvider[];
}
