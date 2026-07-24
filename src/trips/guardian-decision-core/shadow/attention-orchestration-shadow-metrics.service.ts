/**
 * Slice 4 — in-process shadow counters for Attention Orchestration.
 * Observation-only until ATTENTION_ROOT_CAUSE_PRIMARY_SSO=1.
 */

import { Injectable } from '@nestjs/common';
import type {
  AttentionOrchestrationShadowMetricsSnapshot,
  AttentionShadowEvidence,
} from '../contracts/attention-orchestration.types';

function emptyMetrics(): AttentionOrchestrationShadowMetricsSnapshot {
  return {
    source: 'ATTENTION_ROOT_CAUSE_ORCHESTRATION',
    runs: 0,
    inputProblemCount: 0,
    legacyVisibleItemCount: 0,
    shadowVisibleItemCount: 0,
    correctMergeCount: 0,
    correctSeparationCount: 0,
    falseMergeCount: 0,
    missedMergeCount: 0,
    wrongPrimaryCount: 0,
    wrongAttentionLevelCount: 0,
    duplicateVisibleCardReductionCount: 0,
    suppressedNoActionCount: 0,
    escalationCount: 0,
    staleClusterCount: 0,
    crossModuleClusterCount: 0,
    weatherToExecutionClusterCount: 0,
    executionToNightRiskClusterCount: 0,
    ingestCount: 0,
    clusterCreatedCount: 0,
    clusterUpdatedCount: 0,
    duplicateClusterPreventedCount: 0,
    primaryUpgradeCount: 0,
    attentionEscalationCount: 0,
    suppressedReNotifyCount: 0,
    legacyQueueItemCount: 0,
    shadowPrimaryItemCount: 0,
    duplicateVisibleCardsAvoided: 0,
    wrongAttentionEscalationCount: 0,
  };
}

@Injectable()
export class AttentionOrchestrationShadowMetricsService {
  private metrics: AttentionOrchestrationShadowMetricsSnapshot = emptyMetrics();

  applyRunDelta(evidence: AttentionShadowEvidence): void {
    const delta = evidence.metricsSnapshot;
    this.metrics.runs += 1;
    this.metrics.inputProblemCount += delta.inputProblemCount ?? evidence.inputProblems.length;
    this.metrics.legacyVisibleItemCount = evidence.comparison.legacyVisibleCount;
    this.metrics.shadowVisibleItemCount = evidence.comparison.shadowVisibleCount;
    this.metrics.legacyQueueItemCount = evidence.comparison.legacyVisibleCount;
    this.metrics.shadowPrimaryItemCount = evidence.comparison.shadowVisibleCount;

    this.metrics.correctMergeCount += delta.correctMergeCount ?? 0;
    this.metrics.correctSeparationCount += delta.correctSeparationCount ?? 0;
    this.metrics.falseMergeCount += delta.falseMergeCount ?? 0;
    this.metrics.missedMergeCount += delta.missedMergeCount ?? 0;
    this.metrics.wrongPrimaryCount += delta.wrongPrimaryCount ?? 0;
    this.metrics.wrongAttentionLevelCount += delta.wrongAttentionLevelCount ?? 0;
    this.metrics.duplicateVisibleCardReductionCount +=
      delta.duplicateVisibleCardReductionCount ?? 0;
    this.metrics.duplicateVisibleCardsAvoided +=
      delta.duplicateVisibleCardsAvoided ?? delta.duplicateVisibleCardReductionCount ?? 0;
    this.metrics.weatherToExecutionClusterCount +=
      delta.weatherToExecutionClusterCount ?? 0;
    this.metrics.executionToNightRiskClusterCount +=
      delta.executionToNightRiskClusterCount ?? 0;

    this.touch();
  }

  recordIngest(): void {
    this.metrics.ingestCount += 1;
    this.touch();
  }

  recordClusterCreated(): void {
    this.metrics.clusterCreatedCount += 1;
    this.touch();
  }

  recordClusterUpdated(opts?: { duplicatePrevented?: boolean }): void {
    this.metrics.clusterUpdatedCount += 1;
    if (opts?.duplicatePrevented) {
      this.metrics.duplicateClusterPreventedCount += 1;
    }
    this.touch();
  }

  recordPrimaryUpgrade(): void {
    this.metrics.primaryUpgradeCount += 1;
    this.touch();
  }

  recordAttentionEscalation(): void {
    this.metrics.attentionEscalationCount += 1;
    this.metrics.escalationCount += 1;
    this.touch();
  }

  recordSuppressedReNotify(): void {
    this.metrics.suppressedReNotifyCount += 1;
    this.touch();
  }

  snapshot(): AttentionOrchestrationShadowMetricsSnapshot {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = emptyMetrics();
  }

  private touch(): void {
    this.metrics.lastUpdatedAt = new Date().toISOString();
  }
}
