/**
 * Slice 3 Sprint 4 — in-process shadow counters for EXECUTION_SCHEDULE_INFEASIBLE.
 * Observation-only; not full Attention orchestration.
 */

import { Injectable } from '@nestjs/common';

export interface ExecutionSlipShadowMetricsSnapshot {
  source: 'EXECUTION_SCHEDULE_INFEASIBLE';
  triggerCount: number;
  problemCreatedCount: number;
  noActionCount: number;
  duplicateProblemCount: number;
  candidateCount: number;
  rejectedCandidateCount: number;
  writeCount: number;
  legacyWriteCount: number;
  revalidationPassCount: number;
  unresolvedAfterApplyCount: number;
  idempotentReplayCount: number;
  lastUpdatedAt?: string;
}

@Injectable()
export class ExecutionSlipShadowMetricsService {
  private metrics: ExecutionSlipShadowMetricsSnapshot = {
    source: 'EXECUTION_SCHEDULE_INFEASIBLE',
    triggerCount: 0,
    problemCreatedCount: 0,
    noActionCount: 0,
    duplicateProblemCount: 0,
    candidateCount: 0,
    rejectedCandidateCount: 0,
    writeCount: 0,
    legacyWriteCount: 0,
    revalidationPassCount: 0,
    unresolvedAfterApplyCount: 0,
    idempotentReplayCount: 0,
  };

  recordTrigger(): void {
    this.metrics.triggerCount += 1;
    this.touch();
  }

  recordNoAction(): void {
    this.metrics.noActionCount += 1;
    this.touch();
  }

  recordProblemCreated(opts?: { duplicate?: boolean }): void {
    this.metrics.problemCreatedCount += 1;
    if (opts?.duplicate) this.metrics.duplicateProblemCount += 1;
    this.touch();
  }

  recordCandidates(total: number, rejected: number): void {
    this.metrics.candidateCount += total;
    this.metrics.rejectedCandidateCount += rejected;
    this.touch();
  }

  recordWrite(): void {
    this.metrics.writeCount += 1;
    this.touch();
  }

  recordLegacyWriteAttempt(): void {
    this.metrics.legacyWriteCount += 1;
    this.touch();
  }

  recordRevalidationPass(): void {
    this.metrics.revalidationPassCount += 1;
    this.touch();
  }

  recordUnresolvedAfterApply(): void {
    this.metrics.unresolvedAfterApplyCount += 1;
    this.touch();
  }

  recordIdempotentReplay(): void {
    this.metrics.idempotentReplayCount += 1;
    this.touch();
  }

  snapshot(): ExecutionSlipShadowMetricsSnapshot {
    return { ...this.metrics };
  }

  private touch(): void {
    this.metrics.lastUpdatedAt = new Date().toISOString();
  }
}
