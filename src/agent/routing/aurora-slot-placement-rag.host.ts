/**
 * 极光槽位选日 RAG 宿主：ChunkRetrieval / Reality Policy Gate 仍挂在 ClaudeOrchestrator。
 */

import type { Logger } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  ChunkRetrievalParams,
  ChunkRetrievalResult,
} from '../../rag/services/chunk-retrieval.service';
import type { RagSoftWorldScope } from '../../rag/reality-policy/rag-soft-world-policy';
import type { DecisionContextV0 } from '../../trips/reality-kernel/decision-context.types';

export interface AuroraSlotPlacementRagHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly chunkRetrieval?: {
    retrieve: (
      params: ChunkRetrievalParams,
    ) => Promise<ChunkRetrievalResult[] | null | undefined>;
  };
  readonly ragRealityPolicyGate: {
    resolve: (decisionContext: DecisionContextV0 | undefined) => {
      scope: RagSoftWorldScope;
      policy: { codes?: string[] };
    };
    mergeChunkRetrievalParams: (
      params: ChunkRetrievalParams,
      scope: RagSoftWorldScope,
    ) => ChunkRetrievalParams;
  };

  formatRagDocumentTitle(r: ChunkRetrievalResult): string;
  buildLightweightDecisionContextForRealityGate(
    request: RouteAndRunRequestDto,
    tripId?: string,
  ): Promise<DecisionContextV0>;
}
