import type { WorldFact } from '@prisma/client';
import type { FactFreshnessMeta } from './world-fact-freshness.util';

/** Resolver 统一输出：原始行 + 生命周期元数据（单一读取主权） */
export interface ResolvedWorldFact {
  fact: WorldFact;
  freshness: FactFreshnessMeta;
}
