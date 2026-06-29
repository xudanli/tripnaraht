import type { DecisionCheckerResponse } from '../types/decision-checker.types';
import type { PlanningConflictsResponse } from '../types/planning-conflicts.types';
import type { TripFeasibilityReportDto } from '../types/trip-constraint-solver.types';

export type DecisionCheckerDeferredStatus = 'pending' | 'ready' | 'failed';

export interface PlanningDecisionCheckerDeferredTask {
  tripId: string;
  createdAt: number;
  focusConflictId?: string;
  planningResponse: PlanningConflictsResponse;
  report: TripFeasibilityReportDto;
  status: DecisionCheckerDeferredStatus;
  decisionChecker?: DecisionCheckerResponse;
  error?: string;
  promise: Promise<DecisionCheckerResponse>;
}

const TTL_MS = 10 * 60 * 1000;
/** pending 轮询建议间隔（全量 loadArtifacts 常需数十秒～数分钟） */
export const DECISION_CHECKER_DEFERRED_POLL_INTERVAL_MS = 5_000;
/** 超过此时间仍 pending 且无 decisionChecker 的 task 视为僵尸，不再复用 */
export const DECISION_CHECKER_STALE_PENDING_MS = 90_000;

export class DecisionCheckerDeferredStore {
  private readonly tasks = new Map<string, PlanningDecisionCheckerDeferredTask>();

  put(taskId: string, entry: PlanningDecisionCheckerDeferredTask): void {
    this.cleanup();
    this.tasks.set(taskId, entry);
  }

  get(taskId: string): PlanningDecisionCheckerDeferredTask | undefined {
    const entry = this.tasks.get(taskId);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > TTL_MS) {
      this.tasks.delete(taskId);
      return undefined;
    }
    return entry;
  }

  /** 同一 trip 已有 pending 任务时复用，避免前端重复 includeDecisionChecker=1 叠 N 个全量计算 */
  findActivePendingForTrip(
    tripId: string,
    stalePendingMs = DECISION_CHECKER_STALE_PENDING_MS,
  ): { taskId: string; entry: PlanningDecisionCheckerDeferredTask } | undefined {
    this.cleanup();
    const now = Date.now();
    for (const [taskId, entry] of this.tasks) {
      if (entry.tripId !== tripId) continue;
      if (now - entry.createdAt > TTL_MS) {
        this.tasks.delete(taskId);
        continue;
      }
      if (entry.status !== 'pending') continue;
      const age = now - entry.createdAt;
      if (age > stalePendingMs && !entry.decisionChecker) {
        this.tasks.delete(taskId);
        continue;
      }
      return { taskId, entry };
    }
    return undefined;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, entry] of this.tasks) {
      if (now - entry.createdAt > TTL_MS) {
        this.tasks.delete(id);
      }
    }
  }
}
