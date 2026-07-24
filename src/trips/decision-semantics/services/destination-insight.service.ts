import { Injectable, Logger, Optional } from '@nestjs/common';
import { ChunkRetrievalService } from '../../../rag/services/chunk-retrieval.service';
import { PlanningConflictsService } from '../../trip-constraint-solver/services/planning-conflicts.service';
import { DecisionProblemCollectorService } from '../collectors/decision-problem.collector';
import type {
  DestinationInsightBundle,
  DestinationInsightQuery,
} from '../types/destination-insight.types';
import {
  dedupeInsights,
  filterConflictsForFocus,
  insightsFromDecisionProblem,
  insightsFromPlanningConflict,
  insightsFromRagChunks,
} from '../utils/destination-insight.projection.util';

@Injectable()
export class DestinationInsightService {
  private readonly logger = new Logger(DestinationInsightService.name);

  constructor(
    private readonly planningConflicts: PlanningConflictsService,
    private readonly problemCollector: DecisionProblemCollectorService,
    @Optional() private readonly chunkRetrieval?: ChunkRetrievalService,
  ) {}

  async getBundle(tripId: string, query: DestinationInsightQuery): Promise<DestinationInsightBundle> {
    const focus = {
      focusConflictId: query.focusConflictId,
      problemId: query.problemId,
      placeId: query.placeId,
      poiSlug: query.poiSlug,
      dayIndex: query.dayIndex,
    };

    const [{ conflicts }, collected] = await Promise.all([
      this.planningConflicts.getPlanningConflicts(tripId),
      query.problemId ? this.problemCollector.collect(tripId) : Promise.resolve(null),
    ]);

    const filtered = filterConflictsForFocus(conflicts, focus);
    let insights = filtered.flatMap((c) => insightsFromPlanningConflict(c));

    let problemCount = 0;
    if (query.problemId && collected) {
      const detail = collected.items.find(
        (p) => p.id === query.problemId || p.semanticKey === query.problemId,
      );
      if (detail) {
        problemCount = 1;
        insights = dedupeInsights([...insights, ...insightsFromDecisionProblem(detail)]);
      }
    }

    const meta: DestinationInsightBundle['meta'] = {
      conflictCount: filtered.length,
      problemCount,
    };

    if (query.includeRag) {
      const ragResult = await this.tryScopedRagRetrieval(filtered, query);
      if (ragResult.skipped) {
        meta.ragRetrievalSkipped = true;
        meta.skipReason = ragResult.reason;
      } else if (ragResult.chunks.length) {
        insights = dedupeInsights([...insights, ...insightsFromRagChunks(ragResult.chunks)]);
      }
    } else {
      meta.ragRetrievalSkipped = true;
      meta.skipReason = 'includeRag_not_requested';
    }

    return {
      schemaId: 'tripnara.destination_insight_bundle@v1',
      tripId,
      focus: Object.values(focus).some((v) => v != null && v !== '')
        ? {
            conflictId: query.focusConflictId,
            problemId: query.problemId,
            placeId: query.placeId,
            poiSlug: query.poiSlug,
            dayIndex: query.dayIndex,
          }
        : undefined,
      generatedAt: new Date().toISOString(),
      insights,
      meta,
    };
  }

  private async tryScopedRagRetrieval(
    conflicts: Awaited<ReturnType<PlanningConflictsService['getPlanningConflicts']>>['conflicts'],
    query: DestinationInsightQuery,
  ): Promise<{
    skipped: boolean;
    reason?: string;
    chunks: Array<{
      chunkId: string;
      content: string;
      category?: string;
      credibilityScore?: number;
      metadata?: Record<string, unknown>;
    }>;
  }> {
    if (!this.chunkRetrieval) {
      return { skipped: true, reason: 'chunk_retrieval_unavailable', chunks: [] };
    }

    const primary = conflicts[0];
    const poiSlug = query.poiSlug ?? primary?.issue?.visitorAccess?.evaluation?.poiId;
    const title = primary?.title ?? query.poiSlug ?? 'Iceland travel safety';
    const q = poiSlug
      ? `Iceland ${poiSlug} ${title} safety rules official guidance`
      : `Iceland ${title} travel rules seasonal guidance`;

    const chunkCategory =
      primary?.category === 'access_capacity'
        ? undefined
        : primary?.category === 'environment'
          ? 'RISK_INFO'
          : undefined;

    try {
      const rows = await this.chunkRetrieval.retrieve({
        query: q,
        limit: 3,
        credibilityMin: 0.5,
        chunkCategory,
        useHybridSearch: true,
        useReranking: false,
        useQueryExpansion: false,
      });
      return {
        skipped: false,
        chunks: rows.map((r) => ({
          chunkId: r.chunkId,
          content: r.content,
          category: r.category ?? undefined,
          credibilityScore: r.credibilityScore,
          metadata: r.metadata as Record<string, unknown> | undefined,
        })),
      };
    } catch (err) {
      this.logger.debug(`Scoped RAG skipped: ${(err as Error).message}`);
      return { skipped: true, reason: (err as Error).message, chunks: [] };
    }
  }
}
