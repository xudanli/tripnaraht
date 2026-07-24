/**
 * P0 feedback + observability store (in-memory). No personalization ranking yet.
 */

import { Injectable } from '@nestjs/common';
import type { InsightFeedbackType } from '../contracts/page-insight.types';

export interface InsightFeedbackRecord {
  tripId: string;
  insightId: string;
  type: InsightFeedbackType;
  actionRef?: string | null;
  note?: string | null;
  clientTimestamp?: string;
  contextHash: string;
  problemId?: string;
  recordedAt: string;
}

export interface InsightMetricRecord {
  tripId: string;
  insightId: string;
  contextHash: string;
  event: 'GENERATED' | 'CACHE_HIT' | 'SHOWN' | 'OPENED';
  problemId?: string;
  generationSource?: 'RULE' | 'LLM' | 'CACHE';
  llmDegraded?: boolean;
  recordedAt: string;
}

@Injectable()
export class PageInsightFeedbackStore {
  private readonly feedback: InsightFeedbackRecord[] = [];
  private readonly metrics: InsightMetricRecord[] = [];

  recordFeedback(
    input: Omit<InsightFeedbackRecord, 'recordedAt'> & { recordedAt?: string },
  ): void {
    this.feedback.push({
      ...input,
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    });
  }

  recordMetric(
    input: Omit<InsightMetricRecord, 'recordedAt'> & { recordedAt?: string },
  ): void {
    this.metrics.push({
      ...input,
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    });
  }

  /** Test / ops helpers */
  listFeedback(tripId?: string): InsightFeedbackRecord[] {
    return tripId
      ? this.feedback.filter((f) => f.tripId === tripId)
      : [...this.feedback];
  }

  listMetrics(tripId?: string): InsightMetricRecord[] {
    return tripId
      ? this.metrics.filter((m) => m.tripId === tripId)
      : [...this.metrics];
  }
}
