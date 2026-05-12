/**
 * Self-Healing Controller — 决策何时继续收敛、何时视为稳定
 */

import type { ConstraintDiff } from '../stream/constraint-stream.types';
import { evaluateStability } from './stability.evaluator';
import type { StabilityMetricsInput } from './stability.metrics';
import type { HealingState } from './healing.types';

const VELOCITY_WINDOW_MS = 60_000;

export interface SelfHealingControllerOptions {
  readonly velocityThreshold?: number;
}

export interface SelfHealingIngestResult extends HealingState {
  readonly stabilityScore: number;
  /** 当状态为 STABLE 时上层可选择暂停约束流（仅信号，不强制停 transport） */
  readonly shouldPauseStream: boolean;
}

/**
 * 维护迭代计数与短时 delta 速率，结合 StabilityEvaluator 输出 HealingState。
 */
export class SelfHealingController {
  private iteration = 0;

  private readonly velocityThreshold: number;

  /** epoch ms，用于 deltaVelocity */
  private readonly recentMeaningfulAt: number[] = [];

  constructor(options?: SelfHealingControllerOptions) {
    this.velocityThreshold = options?.velocityThreshold ?? 8;
  }

  private pruneVelocity(nowMs: number): void {
    const cutoff = nowMs - VELOCITY_WINDOW_MS;
    while (
      this.recentMeaningfulAt.length > 0 &&
      this.recentMeaningfulAt[0]! < cutoff
    ) {
      this.recentMeaningfulAt.shift();
    }
  }

  private deltaVelocity(nowMs: number): number {
    this.pruneVelocity(nowMs);
    return this.recentMeaningfulAt.length;
  }

  /**
   * 注入一条约束 diff（通常来自 Constraint Diff Engine 之后）。
   */
  ingest(diff: ConstraintDiff, nowMs: number = Date.now()): SelfHealingIngestResult {
    this.pruneVelocity(nowMs);

    if (diff.isMeaningfulChange) {
      this.iteration++;
      this.recentMeaningfulAt.push(nowMs);
    }

    const velocity = this.deltaVelocity(nowMs);
    const deltaCount = this.recentMeaningfulAt.length;

    const highSeverityIssues =
      diff.severity === 'HIGH' && diff.requiresReplan ? 1 : 0;
    const mediumIssues = diff.severity === 'MEDIUM' && diff.requiresReplan ? 1 : 0;

    const metrics: StabilityMetricsInput = {
      deltaCount,
      highSeverityIssues,
      mediumIssues,
      deltaVelocity: velocity,
      pendingReplans: diff.requiresReplan ? 1 : 0,
    };

    const scored = evaluateStability(metrics, {
      velocityThreshold: this.velocityThreshold,
    });

    let status: HealingState['status'];
    if (!diff.isMeaningfulChange && scored.stable && !diff.requiresReplan) {
      status = 'STABLE';
    } else if (diff.isMeaningfulChange) {
      status = scored.stable ? 'RECOVERING' : 'UNSTABLE';
    } else {
      status = scored.stable ? 'STABLE' : 'UNSTABLE';
    }

    const remainingIssues =
      status === 'STABLE'
        ? 0
        : highSeverityIssues + mediumIssues + (diff.requiresReplan ? 1 : 0);

    const shouldPauseStream = status === 'STABLE' && !diff.isMeaningfulChange;

    return {
      status,
      iteration: this.iteration,
      remainingIssues,
      stabilityScore: scored.score,
      shouldPauseStream,
    };
  }

  reset(): void {
    this.iteration = 0;
    this.recentMeaningfulAt.length = 0;
  }
}
