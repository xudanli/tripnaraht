import { Injectable, Logger, OnApplicationShutdown, Optional } from '@nestjs/common';
import { RouteAndRunAsyncTaskStore } from './route-and-run-async-task.store';
import { RouteAndRunTaskStreamRegistry } from './route-and-run-task-stream.registry';
import { taskRecordToProgressPayload } from '../utils/route-and-run-task-progress-payload.util';

const SERVER_SHUTDOWN_MESSAGE = 'SERVER_SHUTDOWN: orchestration interrupted by process exit';

/**
 * 进程退出时：将本进程内存中未终态任务标为失败，并关闭仍挂着的 SSE。
 */
@Injectable()
export class RouteAndRunTaskLifecycleService implements OnApplicationShutdown {
  private readonly logger = new Logger(RouteAndRunTaskLifecycleService.name);

  constructor(
    @Optional() private readonly taskStore?: RouteAndRunAsyncTaskStore,
    @Optional() private readonly streamRegistry?: RouteAndRunTaskStreamRegistry,
  ) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    if (!this.taskStore) return;

    const abandoned = await this.taskStore.abandonInFlightTasks(SERVER_SHUTDOWN_MESSAGE);
    if (abandoned.length > 0) {
      this.logger.warn(
        `[lifecycle] marked ${abandoned.length} in-flight task(s) FAILED on shutdown (signal=${signal ?? 'unknown'})`,
      );
    }

    for (const taskId of abandoned) {
      const record = await this.taskStore.getRecord(taskId);
      if (!record || !this.streamRegistry) continue;
      const payload = taskRecordToProgressPayload(record, 'ERROR');
      this.streamRegistry.terminateTaskConnections(taskId, (handle) => {
        handle.pushTerminal(payload);
        handle.close();
      });
    }
  }
}
