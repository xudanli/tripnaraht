/**
 * Nest helper: merge ChunkRetrieval params under degraded RAG scope + expose policy resolution.
 */

import { Injectable } from '@nestjs/common';
import type { DecisionContextV0 } from '../../trips/reality-kernel/decision-context.types';
import type { ChunkRetrievalParams } from './chunk-retrieval.service';
import type { RagSoftWorldScope } from '../reality-policy/rag-soft-world-policy';
import { resolveRagSoftWorldPolicy } from '../reality-policy/rag-soft-world-policy';
import { getRagDegradedChunkCategory } from '../reality-policy/rag-reality-policy.env';

@Injectable()
export class RagRealityPolicyGateService {
  resolve(decisionContext: DecisionContextV0 | undefined) {
    return resolveRagSoftWorldPolicy(decisionContext);
  }

  /** Narrow chunk retrieval to safe taxonomy when snapshot is STALE / policy DEGRADE. */
  mergeChunkRetrievalParams(params: ChunkRetrievalParams, scope: RagSoftWorldScope): ChunkRetrievalParams {
    if (scope !== 'restricted') {
      return params;
    }
    const safe = getRagDegradedChunkCategory();
    return {
      ...params,
      chunkCategory: safe,
    };
  }
}
