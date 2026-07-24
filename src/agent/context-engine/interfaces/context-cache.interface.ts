/**
 * Context Cache 接口
 *
 * Phase 5: Context Engine 工业化 - L1/L2 缓存、失效策略
 * 参考: docs/CONTEXT_ENGINE_INDUSTRIALIZATION_PLAN.md
 */

import { ContextPackage } from '../types/context-package.types';

/** 缓存命中结果 */
export interface ContextCacheHit {
  hit: true;
  package: ContextPackage;
  level: 'L1' | 'L2';
}

/** 缓存未命中 */
export interface ContextCacheMiss {
  hit: false;
}

export type ContextCacheGetResult = ContextCacheHit | ContextCacheMiss;

export type ContextCacheGetOptions = { phase?: string };
export type ContextCacheSetOptions = { phase?: string; tripId?: string };

/** ContextCache 能力接口 */
export interface IContextCache {
  get(key: string, options?: ContextCacheGetOptions): Promise<ContextCacheGetResult>;
  set(key: string, pkg: ContextPackage, options?: ContextCacheSetOptions): Promise<void>;
  clear(): Promise<void>;
  getStats(): { memorySize: number; memoryKeys?: string[] };
}
