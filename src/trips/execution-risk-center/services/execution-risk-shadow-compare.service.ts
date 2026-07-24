import { Injectable, Optional } from '@nestjs/common';
import { ActiveRiskAggregationService } from './active-risk-aggregation.service';
import { ExecutionRiskShadowMetricsService } from './execution-risk-shadow-metrics.service';
import { buildExecutionRiskShadowComparison } from '../shadow/execution-risk-shadow-compare.util';
import type {
  ExecutionRiskCutoverBuildMetadata,
  ExecutionRiskShadowComparison,
} from '../shadow/execution-risk-shadow-compare.types';
import { buildLegacyRiskFingerprints } from '../shadow/legacy-risk-fingerprint.util';
import {
  buildCanonicalRiskFingerprints,
  countUnknownKnowledgeCodes,
  resolveCanonicalPrimaryRiskId,
} from '../shadow/canonical-risk-fingerprint.util';
import { isExecutionRiskShadowCompareEnabled } from '../config/execution-risk-feature-flags.util';
import { Rfc001PlanVersionStoreService } from '../../guardian-decision-core/plan-version/plan-version.store';
import { ExecutionRiskKnowledgeRepositoryService } from '../knowledge/execution-risk-knowledge.repository';
import { buildCutoverBuildMetadata } from '../shadow/execution-risk-cutover-build-metadata.util';
import { assertClusterVisibilityConsistency } from '../shadow/cluster-visibility-consistency.util';

export interface ExecutionRiskShadowCompareResult {
  comparison: ExecutionRiskShadowComparison;
  build: ExecutionRiskCutoverBuildMetadata;
  clusterVisibilityConsistency: ReturnType<typeof assertClusterVisibilityConsistency>;
}

@Injectable()
export class ExecutionRiskShadowCompareService {
  constructor(
    private readonly aggregation: ActiveRiskAggregationService,
    private readonly metrics: ExecutionRiskShadowMetricsService,
    @Optional() private readonly planVersionStore?: Rfc001PlanVersionStoreService,
    @Optional() private readonly knowledge?: ExecutionRiskKnowledgeRepositoryService,
  ) {}

  isEnabled(): boolean {
    return isExecutionRiskShadowCompareEnabled();
  }

  async compareForTrip(tripId: string, userId: string): Promise<ExecutionRiskShadowCompareResult> {
    const [rawProjections, canonicalRisks, planVersionId, knowledgeVersion] = await Promise.all([
      this.aggregation.collectSourceProjections(tripId, userId),
      this.aggregation.listRisks(tripId, userId),
      this.planVersionStore?.getEffectivePlanVersionId(tripId).catch(() => undefined),
      this.knowledge?.getActiveKnowledgeVersion().then((v) => v.version).catch(() => undefined),
    ]);

    const comparison = buildExecutionRiskShadowComparison({
      tripId,
      legacyFingerprints: buildLegacyRiskFingerprints(rawProjections),
      canonicalFingerprints: buildCanonicalRiskFingerprints(canonicalRisks),
      canonicalRisks,
      canonicalPrimaryId: resolveCanonicalPrimaryRiskId(canonicalRisks),
      unknownKnowledgeCodeCount: countUnknownKnowledgeCodes(canonicalRisks),
      planVersionId,
    });

    const build = buildCutoverBuildMetadata({ knowledgeVersion });
    const clusterVisibilityConsistency = assertClusterVisibilityConsistency(
      comparison.semanticComparison.clusterVisibility,
    );

    if (this.isEnabled()) {
      this.metrics.recordComparison(comparison);
    }

    return { comparison, build, clusterVisibilityConsistency };
  }
}
