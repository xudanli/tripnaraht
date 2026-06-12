import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { RouteAndRunAsyncTaskStore } from './route-and-run-async-task.store';
import { RouteAndRunAsyncService } from './route-and-run-async.service';
import { parseTaskMaxResume } from '../runtime/route-and-run-task-lease.constants';
import { resolveTaskLeaseStatus } from '../runtime/route-and-run-task-lease.util';

/**
 * P2 Worker Lease：检测 task_progress 心跳过期并触发 durable_trip_run_id 断点续跑。
 */
@Injectable()
export class RouteAndRunAsyncTaskLeaseService {
  private readonly logger = new Logger(RouteAndRunAsyncTaskLeaseService.name);
  private readonly resumeInFlight = new Set<string>();

  constructor(
    private readonly taskStore: RouteAndRunAsyncTaskStore,
    @Inject(forwardRef(() => RouteAndRunAsyncService))
    private readonly asyncService: RouteAndRunAsyncService,
  ) {}

  /**
   * 轮询 getStatus 时调用：STALE 且未超 resume 上限 → 后台 schedule resume（幂等）。
   */
  async maybeResumeStaleTask(taskId: string): Promise<boolean> {
    const record = await this.taskStore.getRecord(taskId);
    if (!record) return false;
    const status = resolveTaskLeaseStatus(record);
    if (status !== 'STALE') return false;
    if (this.resumeInFlight.has(taskId)) return true;
    if ((record.resume_count ?? 0) >= parseTaskMaxResume()) {
      await this.taskStore.markFailed(
        taskId,
        `Worker lease expired and max resume (${parseTaskMaxResume()}) exhausted`,
      );
      return false;
    }
    this.resumeInFlight.add(taskId);
    try {
      await this.asyncService.resumeStaleTask(taskId);
      return true;
    } finally {
      this.resumeInFlight.delete(taskId);
    }
  }

  async resumeTaskExplicit(taskId: string): Promise<void> {
    await this.asyncService.resumeStaleTask(taskId, { explicit: true });
  }
}
