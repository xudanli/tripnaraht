/** Sprint 5 — Check job Redis 持久化配置 */

export const EXPLORATION_CHECK_JOB_CACHE_PREFIX = 'exploration_check_job';

/** Job 记录在 Redis / 内存缓存中的 TTL（秒），默认 24h */
export const EXPLORATION_CHECK_JOB_TTL_SEC = Number(
  process.env.EXPLORATION_CHECK_JOB_TTL_SEC ?? 24 * 60 * 60,
);
