/** 专用于 route_and_run 任务进度 Pub/Sub（与 cache-manager 连接分离）。 */
export const ROUTE_AND_RUN_REDIS_MAIN_CLIENT = Symbol('ROUTE_AND_RUN_REDIS_MAIN_CLIENT');
export const ROUTE_AND_RUN_REDIS_SUB_CLIENT = Symbol('ROUTE_AND_RUN_REDIS_SUB_CLIENT');
