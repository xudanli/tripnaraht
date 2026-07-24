import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';
import {
  ROUTE_AND_RUN_REDIS_MAIN_CLIENT,
  ROUTE_AND_RUN_REDIS_SUB_CLIENT,
} from './route-and-run-redis-pubsub.tokens';

const logger = new Logger('RouteAndRunRedisPubSub');

export function isRouteAndRunRedisPubSubEnabled(configService?: ConfigService): boolean {
  if (process.env.DISABLE_REDIS === 'true') return false;
  const driver =
    configService?.get<string>('ROUTE_AND_RUN_TASK_EVENT_BUS_DRIVER') ??
    process.env.ROUTE_AND_RUN_TASK_EVENT_BUS_DRIVER ??
    'local';
  return driver === 'redis';
}

function buildRedisOptions(configService: ConfigService): RedisOptions {
  return {
    host: configService.get<string>('REDIS_HOST', 'localhost'),
    port: configService.get<number>('REDIS_PORT', 6379),
    password: configService.get<string>('REDIS_PASSWORD') || undefined,
    db: configService.get<number>('REDIS_DB', 0),
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  };
}

async function connectRedisClient(
  client: Redis,
  label: 'main' | 'sub',
): Promise<Redis | null> {
  try {
    await client.ping();
    logger.log(`[${label}] Redis client ready for route_and_run task bus`);
    return client;
  } catch (e: unknown) {
    logger.warn(
      `[${label}] ping failed, pub/sub unavailable: ${e instanceof Error ? e.message : String(e)}`,
    );
    client.disconnect();
    return null;
  }
}

export const routeAndRunRedisPubSubProviders = [
  {
    provide: ROUTE_AND_RUN_REDIS_MAIN_CLIENT,
    useFactory: async (configService: ConfigService): Promise<Redis | null> => {
      if (!isRouteAndRunRedisPubSubEnabled(configService)) return null;
      const client = new Redis(buildRedisOptions(configService));
      client.on('error', (err) => {
        logger.warn(`[main] Redis error: ${err.message}`);
      });
      return connectRedisClient(client, 'main');
    },
    inject: [ConfigService],
  },
  {
    provide: ROUTE_AND_RUN_REDIS_SUB_CLIENT,
    useFactory: async (configService: ConfigService): Promise<Redis | null> => {
      if (!isRouteAndRunRedisPubSubEnabled(configService)) return null;
      const client = new Redis(buildRedisOptions(configService));
      client.on('error', (err) => {
        logger.warn(`[sub] Redis error: ${err.message}`);
      });
      return connectRedisClient(client, 'sub');
    },
    inject: [ConfigService],
  },
];
