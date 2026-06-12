/**
 * 知识图谱动态化 v1.1 接口：Redis 热缓存 + 向量粗筛（当前静态实现为降级层）。
 */

import type { EntityCandidate } from '../services/query-rewriting-dictionary.service';

export interface EntityResolutionCacheHit {
  standard: string;
  kind: 'destination' | 'poi';
  source: 'redis' | 'vector' | 'static';
  score?: number;
}

export interface EntityResolutionCacheProvider {
  /** 一级：高频别名直出（0ms 目标） */
  resolveAlias(alias: string): Promise<EntityResolutionCacheHit | undefined>;
  /** 二级：向量/语义粗筛 Top-N（注入 Stage 1 candidateEntities） */
  findVectorCandidates(query: string, limit?: number): Promise<EntityCandidate[]>;
}
