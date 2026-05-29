import type { Provider } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ROUTE_AND_RUN_TASK_EVENT_BUS } from '../ports/route-and-run-task-event-bus.port';
import { LocalRouteAndRunTaskEventBus } from '../services/local-route-and-run-task-event.bus';
import { RedisPubSubRouteAndRunTaskEventBus } from '../services/redis-pub-sub-route-and-run-task-event.bus';
import { isRouteAndRunRedisPubSubEnabled } from '../redis/route-and-run-redis-pubsub.providers';

/**
 * `ROUTE_AND_RUN_TASK_EVENT_BUS_DRIVER=redis` 且 Redis 客户端可用时用 Pub/Sub，否则 Local。
 */
const logger = new Logger('RouteAndRunTaskEventBus');

export const routeAndRunTaskEventBusProvider: Provider = {
  provide: ROUTE_AND_RUN_TASK_EVENT_BUS,
  useFactory: (
    configService: ConfigService,
    local: LocalRouteAndRunTaskEventBus,
    redis: RedisPubSubRouteAndRunTaskEventBus,
  ) => {
    if (isRouteAndRunRedisPubSubEnabled(configService) && redis.isAvailable) {
      logger.log('Using RedisPubSubRouteAndRunTaskEventBus (multi-Pod PHASE delivery)');
      return redis;
    }
    logger.log('Using LocalRouteAndRunTaskEventBus (in-process EventEmitter2)');
    return local;
  },
  inject: [ConfigService, LocalRouteAndRunTaskEventBus, RedisPubSubRouteAndRunTaskEventBus],
};
