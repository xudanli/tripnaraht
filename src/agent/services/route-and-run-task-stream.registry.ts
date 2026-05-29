import { Injectable } from '@nestjs/common';
import type { RouteAndRunTaskProgressPayload } from '../events/route-and-run-task.events';

export type RouteAndRunSseConnectionHandle = {
  taskId: string;
  connectionId: string;
  pushTerminal: (payload: RouteAndRunTaskProgressPayload) => void;
  close: () => void;
};

/**
 * 跟踪活跃 SSE 连接，供优雅停机时向客户端推送 ERROR 并关闭。
 */
@Injectable()
export class RouteAndRunTaskStreamRegistry {
  private seq = 0;
  private readonly byTask = new Map<string, Set<RouteAndRunSseConnectionHandle>>();
  private readonly byConnection = new Map<string, RouteAndRunSseConnectionHandle>();

  register(handle: RouteAndRunSseConnectionHandle): () => void {
    const { taskId, connectionId } = handle;
    let set = this.byTask.get(taskId);
    if (!set) {
      set = new Set();
      this.byTask.set(taskId, set);
    }
    set.add(handle);
    this.byConnection.set(connectionId, handle);

    return () => {
      set?.delete(handle);
      if (set?.size === 0) {
        this.byTask.delete(taskId);
      }
      this.byConnection.delete(connectionId);
    };
  }

  activeConnectionCount(): number {
    return this.byConnection.size;
  }

  /** 向某 task 的所有 SSE 连接推送终态并关闭（如 SERVER_SHUTDOWN）。 */
  terminateTaskConnections(
    taskId: string,
    push: (handle: RouteAndRunSseConnectionHandle) => void,
  ): number {
    const set = this.byTask.get(taskId);
    if (!set?.size) return 0;
    let n = 0;
    for (const handle of [...set]) {
      push(handle);
      n++;
    }
    return n;
  }
}
