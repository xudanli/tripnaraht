import type { RouteAndRunTaskProgressPayload } from '../events/route-and-run-task.events';

/**
 * 任务进度事件总线（进程内 EventEmitter 或跨 Pod Redis pub/sub 的统一端口）。
 *
 * 切换：`ROUTE_AND_RUN_TASK_EVENT_BUS_DRIVER=redis`（需 Redis 可用，`DISABLE_REDIS` 不为 true）。
 * 默认 `local`（单 Pod / 开发）。
 */
export interface RouteAndRunTaskEventBusPort {
  emitProgress(payload: RouteAndRunTaskProgressPayload): void;
  onProgress(taskId: string, handler: (payload: RouteAndRunTaskProgressPayload) => void): void;
  offProgress(taskId: string, handler: (payload: RouteAndRunTaskProgressPayload) => void): void;
}

export const ROUTE_AND_RUN_TASK_EVENT_BUS = Symbol('ROUTE_AND_RUN_TASK_EVENT_BUS');
