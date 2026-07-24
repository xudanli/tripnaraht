import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import type { RouteAndRunTaskEventBusPort } from '../ports/route-and-run-task-event-bus.port';
import type { RouteAndRunTaskProgressPayload } from '../events/route-and-run-task.events';
import {
  ROUTE_AND_RUN_REDIS_MAIN_CLIENT,
  ROUTE_AND_RUN_REDIS_SUB_CLIENT,
} from '../redis/route-and-run-redis-pubsub.tokens';

const CHANNEL_PREFIX = 'route_and_run:task:';

@Injectable()
export class RedisPubSubRouteAndRunTaskEventBus
  implements RouteAndRunTaskEventBusPort, OnModuleDestroy
{
  private readonly logger = new Logger(RedisPubSubRouteAndRunTaskEventBus.name);
  private readonly listenersMap = new Map<
    string,
    Set<(payload: RouteAndRunTaskProgressPayload) => void>
  >();
  private readonly subscribedChannels = new Set<string>();
  private isGlobalListenerAttached = false;

  constructor(
    @Optional()
    @Inject(ROUTE_AND_RUN_REDIS_MAIN_CLIENT)
    private readonly redisMain: Redis | null,
    @Optional()
    @Inject(ROUTE_AND_RUN_REDIS_SUB_CLIENT)
    private readonly redisSub: Redis | null,
  ) {
    if (!redisMain || !redisSub) {
      this.logger.warn(
        'Redis pub/sub clients not available; inject LocalRouteAndRunTaskEventBus via factory instead',
      );
    }
  }

  get isAvailable(): boolean {
    return !!this.redisMain && !!this.redisSub;
  }

  private channelName(taskId: string): string {
    return `${CHANNEL_PREFIX}${taskId}`;
  }

  private taskIdFromChannel(channel: string): string | null {
    if (!channel.startsWith(CHANNEL_PREFIX)) return null;
    return channel.slice(CHANNEL_PREFIX.length);
  }

  emitProgress(payload: RouteAndRunTaskProgressPayload): void {
    if (!this.redisMain) return;
    const channel = this.channelName(payload.task_id);
    const message = JSON.stringify(payload);
    void this.redisMain.publish(channel, message).catch((err: unknown) => {
      this.logger.warn(
        `publish failed task=${payload.task_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  onProgress(
    taskId: string,
    handler: (payload: RouteAndRunTaskProgressPayload) => void,
  ): void {
    if (!this.redisSub) return;

    let set = this.listenersMap.get(taskId);
    if (!set) {
      set = new Set();
      this.listenersMap.set(taskId, set);
    }
    set.add(handler);

    this.ensureGlobalRedisListener();

    const channel = this.channelName(taskId);
    if (this.subscribedChannels.has(channel)) return;

    this.subscribedChannels.add(channel);
    void this.redisSub.subscribe(channel).catch((err: unknown) => {
      this.subscribedChannels.delete(channel);
      this.logger.warn(
        `subscribe failed channel=${channel}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  offProgress(
    taskId: string,
    handler: (payload: RouteAndRunTaskProgressPayload) => void,
  ): void {
    if (!this.redisSub) return;

    const callbacks = this.listenersMap.get(taskId);
    if (!callbacks) return;

    callbacks.delete(handler);
    if (callbacks.size > 0) return;

    this.listenersMap.delete(taskId);
    const channel = this.channelName(taskId);
    if (!this.subscribedChannels.has(channel)) return;

    this.subscribedChannels.delete(channel);
    void this.redisSub.unsubscribe(channel).catch((err: unknown) => {
      this.logger.warn(
        `unsubscribe failed channel=${channel}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  private ensureGlobalRedisListener(): void {
    if (!this.redisSub || this.isGlobalListenerAttached) return;

    this.redisSub.on('message', (channel: string, message: string) => {
      const taskId = this.taskIdFromChannel(channel);
      if (!taskId) return;

      const callbacks = this.listenersMap.get(taskId);
      if (!callbacks?.size) return;

      try {
        const payload = JSON.parse(message) as RouteAndRunTaskProgressPayload;
        for (const cb of callbacks) {
          try {
            cb(payload);
          } catch (err: unknown) {
            this.logger.warn(
              `listener error task=${taskId}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      } catch (err: unknown) {
        this.logger.warn(
          `[RedisPubSub] parse message failed channel=${channel}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    this.isGlobalListenerAttached = true;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisSub && this.subscribedChannels.size > 0) {
      const channels = [...this.subscribedChannels];
      try {
        await this.redisSub.unsubscribe(...channels);
      } catch (err: unknown) {
        this.logger.warn(
          `shutdown unsubscribe: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.listenersMap.clear();
    this.subscribedChannels.clear();

    if (this.redisSub) {
      this.redisSub.removeAllListeners('message');
      this.redisSub.disconnect();
    }
    if (this.redisMain) {
      this.redisMain.disconnect();
    }
  }
}
