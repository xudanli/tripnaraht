/**
 * 复合意图 CRUD 后 DATA_LOOKUP 跟进宿主。
 */

import type { Logger } from '@nestjs/common';
import type { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';

export interface CompoundDataLookupFollowupHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;

  orchestrateLightweightKnowledgeQuery(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    deadline: { remainingMs: () => number } | undefined,
    llmProvider: LlmProvider,
    startTime: number,
  ): Promise<Pick<OrchestrationResult, 'answerText'>>;
}
