/**
 * Slice 4 Shadow Runner — read-only consumer of UnifiedDecisionProblemReadModelService.
 * Does NOT mutate queue, admission, notifications, or Weather/Road/Execution runtime.
 */

import { forwardRef, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import { isAttentionOrchestrationShadowEnabled } from '../config/rfc002-canonical.config';
import type {
  AttentionShadowEvidence,
  AttentionShadowRunResult,
  AttentionShadowStagingReplayEvidence,
} from '../contracts/attention-orchestration.types';
import { AttentionOrchestrationShadowMetricsService } from '../shadow/attention-orchestration-shadow-metrics.service';
import { AttentionShadowEvidenceWriter } from './attention-shadow-evidence.writer';
import {
  executeAttentionShadowRun,
  runAttentionShadowProjection,
  type AttentionShadowRunInput,
} from './attention-shadow-run.util';
import type { ShadowQuickExpectation } from './attention-shadow-comparison.util';
import type { InternalUnifiedProblemRow } from '../../../decision-runtime/gateway/utils/unified-decision-problem-projection.util';
import {
  buildStagingReplayEvidence,
  type StagingReplayScenarioSpec,
} from './attention-shadow-staging-replay.util';

@Injectable()
export class AttentionOrchestrationShadowRunnerService {
  private readonly logger = new Logger(AttentionOrchestrationShadowRunnerService.name);

  constructor(
    @Optional()
    @Inject(forwardRef(() => UnifiedDecisionProblemReadModelService))
    private readonly readModel: UnifiedDecisionProblemReadModelService | undefined,
    private readonly metrics: AttentionOrchestrationShadowMetricsService,
    private readonly evidenceWriter: AttentionShadowEvidenceWriter,
  ) {}

  isShadowEnabled(): boolean {
    return isAttentionOrchestrationShadowEnabled();
  }

  /**
   * Read-only shadow run from live Unified Read Model.
   * Blocked when ATTENTION_ROOT_CAUSE_ORCHESTRATION != 1.
   */
  async runForTrip(
    tripId: string,
    opts?: {
      expectation?: ShadowQuickExpectation;
      persistEvidence?: boolean;
    },
  ): Promise<AttentionShadowRunResult> {
    if (!this.isShadowEnabled()) {
      return { skipped: true, reason: 'ATTENTION_ROOT_CAUSE_ORCHESTRATION disabled' };
    }
    if (!this.readModel) {
      return { skipped: true, reason: 'UnifiedDecisionProblemReadModelService unavailable' };
    }

    const rows = await this.readModel.collectRows(tripId);
    return this.runFromRows({
      tripId,
      rows,
      source: 'READ_MODEL',
      expectation: opts?.expectation,
      persistEvidence: opts?.persistEvidence ?? true,
    });
  }

  /**
   * Shadow run from pre-collected rows (deterministic drills / harness).
   */
  runFromRows(input: {
    tripId: string;
    rows: InternalUnifiedProblemRow[];
    source: AttentionShadowEvidence['source'];
    expectation?: ShadowQuickExpectation;
    persistEvidence?: boolean;
    contextOverrides?: AttentionShadowRunInput['contextOverrides'];
    lineageOverlay?: AttentionShadowRunInput['lineageOverlay'];
    runAt?: string;
  }): AttentionShadowRunResult {
    if (!this.isShadowEnabled() && input.source !== 'DETERMINISTIC_DRILL' && input.source !== 'STAGING_REPLAY') {
      return { skipped: true, reason: 'ATTENTION_ROOT_CAUSE_ORCHESTRATION disabled' };
    }

    const persist = input.persistEvidence ?? input.source === 'READ_MODEL';
    const result = executeAttentionShadowRun({
      tripId: input.tripId,
      rows: input.rows,
      source: input.source,
      expectation: input.expectation,
      contextOverrides: input.contextOverrides,
      lineageOverlay: input.lineageOverlay,
      runAt: input.runAt,
      writeEvidence: persist
        ? (evidence) => this.evidenceWriter.write(evidence)
        : undefined,
    });

    if (result.evidence) {
      this.metrics.applyRunDelta(result.evidence);
      this.logger.debug(
        `Attention shadow run trip=${input.tripId} verdict=${result.evidence.comparison.verdict} legacy=${result.evidence.comparison.legacyVisibleCount} shadow=${result.evidence.comparison.shadowVisibleCount}`,
      );
    }

    return result;
  }

  /** Exposed for harness — pure rebuild without side effects. */
  projectFromRows(input: Omit<AttentionShadowRunInput, 'writeEvidence'>) {
    return runAttentionShadowProjection(input);
  }

  metricsSnapshot() {
    return this.metrics.snapshot();
  }

  /**
   * Staging real-DB replay — enriched evidence for Observation Closure.
   * Read-only; does not mutate queue or problems.
   */
  async runStagingReplayForTrip(input: {
    spec: StagingReplayScenarioSpec;
    commitSha?: string;
    persistEvidence?: boolean;
    runId?: string;
  }): Promise<AttentionShadowRunResult> {
    if (!this.readModel) {
      return { skipped: true, reason: 'UnifiedDecisionProblemReadModelService unavailable' };
    }

    const rows = await this.readModel.collectRows(input.spec.tripId);
    const output = runAttentionShadowProjection({
      tripId: input.spec.tripId,
      rows,
      source: 'STAGING_REPLAY',
      sampleId: input.spec.scenarioId,
      sampleGroup: 'STAGING_REPLAY',
    });

    const stagingReplay = buildStagingReplayEvidence({
      spec: input.spec,
      rows,
      output,
      commitSha: input.commitSha,
      runId: input.runId,
    });

    let evidencePath: string | undefined;
    if (input.persistEvidence !== false) {
      evidencePath = this.evidenceWriter.writeStagingReplay(stagingReplay);
    }

    this.metrics.applyRunDelta({
      schemaId: 'tripnara.attention_shadow_evidence@v1',
      tripId: input.spec.tripId,
      runAt: stagingReplay.runAt,
      source: 'STAGING_REPLAY',
      sampleId: input.spec.scenarioId,
      sampleGroup: 'STAGING_REPLAY',
      inputProblems: output.inputProblems,
      legacyProjection: output.legacyVisible,
      shadowClusters: output.shadowClusters,
      shadowPrimaryItems: output.shadowPrimaryItems,
      comparison: {
        verdict: stagingReplay.comparison.verdict,
        reason: stagingReplay.comparison.reason,
        reviewStatus: stagingReplay.comparison.reviewStatus,
        legacyVisibleCount: output.legacyVisible.length,
        shadowVisibleCount: output.shadowPrimaryItems.length,
        shadowClusterCount: output.shadowClusters.filter((c) => c.status === 'OPEN').length,
      },
      metricsSnapshot: output.metricsDelta,
    });

    this.logger.log(
      `Staging replay ${input.spec.scenarioId} trip=${input.spec.tripId} verdict=${stagingReplay.comparison.verdict} review=${stagingReplay.comparison.reviewStatus}`,
    );

    return { stagingReplay, evidencePath };
  }
}
