/**
 * 缓存模块导出
 *
 * P2.1 优化：多级缓存
 */

export {
  MultiLevelCacheService,
  CacheKeys,
  hashObject,
} from './multi-level-cache.service';
export type {
  CacheConfig,
  CacheStats,
  CacheEntry,
} from './multi-level-cache.service';

// Decision Cache Service
export { DecisionCacheService, LRUCache } from './decision-cache.service';
export type {
  CacheConfig as DecisionCacheConfig,
  CacheEntry as DecisionCacheEntry,
  CacheStats as DecisionCacheStats,
  CacheKeyBuilder,
} from './decision-cache.service';
