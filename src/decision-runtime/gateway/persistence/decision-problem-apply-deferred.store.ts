import type { ApplyDecisionProblemResponse } from '../contracts/unified-decision-ui.types';

export type DecisionProblemApplyTaskStatus =
  | 'pending'
  | 'applying'
  | 'revalidating'
  | 'ready'
  | 'failed';

export interface DecisionProblemApplyDeferredTask {
  taskId: string;
  tripId: string;
  problemId: string;
  userId: string;
  createdAt: number;
  status: DecisionProblemApplyTaskStatus;
  error?: string;
  result?: ApplyDecisionProblemResponse;
  promise: Promise<ApplyDecisionProblemResponse>;
}

const TTL_MS = 15 * 60 * 1000;

/** 建议轮询间隔（execute 通常数秒；revalidation 可能 10s+） */
export const DECISION_APPLY_DEFERRED_POLL_INTERVAL_MS = 2_000;

export class DecisionProblemApplyDeferredStore {
  private readonly tasks = new Map<string, DecisionProblemApplyDeferredTask>();

  put(taskId: string, entry: DecisionProblemApplyDeferredTask): void {
    this.cleanup();
    this.tasks.set(taskId, entry);
  }

  get(taskId: string): DecisionProblemApplyDeferredTask | undefined {
    const entry = this.tasks.get(taskId);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > TTL_MS) {
      this.tasks.delete(taskId);
      return undefined;
    }
    return entry;
  }

  findActiveForProblem(
    tripId: string,
    problemId: string,
  ): { taskId: string; entry: DecisionProblemApplyDeferredTask } | undefined {
    this.cleanup();
    for (const [taskId, entry] of this.tasks) {
      if (entry.tripId !== tripId || entry.problemId !== problemId) continue;
      if (entry.status === 'ready' || entry.status === 'failed') continue;
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
