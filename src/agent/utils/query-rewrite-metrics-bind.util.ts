/**
 * 下游零结果绑定：RAG / POI / Hotel 共用，失败不阻塞主链路。
 */

import type { Logger } from '@nestjs/common';
import type { QueryRewriteMetricsService } from '../services/query-rewrite-metrics.service';

export function bindQueryRewriteDownstreamSafe(
  metrics: QueryRewriteMetricsService | undefined,
  params: {
    traceId: string | undefined;
    totalResults: number;
    downstreamScene: string;
  },
  logger?: Logger,
): void {
  if (!metrics || !params.traceId) return;
  try {
    metrics.bindDownstreamResults({
      trace_id: params.traceId,
      downstream_total_results: params.totalResults,
      downstream_scene: params.downstreamScene,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger?.warn(`Query rewrite downstream bind failed (${params.downstreamScene}): ${msg}`);
  }
}
