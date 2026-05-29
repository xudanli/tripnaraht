import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { routeAndRunTaskChannel, type RouteAndRunTaskProgressPayload } from '../events/route-and-run-task.events';
import type { RouteAndRunTaskEventBusPort } from '../ports/route-and-run-task-event-bus.port';

/** 单进程 EventEmitter2 实现（多副本时换 RedisPubSubRouteAndRunTaskEventBus）。 */
@Injectable()
export class LocalRouteAndRunTaskEventBus implements RouteAndRunTaskEventBusPort {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  emitProgress(payload: RouteAndRunTaskProgressPayload): void {
    this.eventEmitter.emit(routeAndRunTaskChannel(payload.task_id), payload);
  }

  onProgress(taskId: string, handler: (payload: RouteAndRunTaskProgressPayload) => void): void {
    this.eventEmitter.on(routeAndRunTaskChannel(taskId), handler);
  }

  offProgress(taskId: string, handler: (payload: RouteAndRunTaskProgressPayload) => void): void {
    this.eventEmitter.off(routeAndRunTaskChannel(taskId), handler);
  }
}
