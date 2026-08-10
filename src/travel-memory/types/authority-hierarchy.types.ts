/**
 * Context Authority Hierarchy（冻结）。
 * Reality > Hard Constraint > Trip > Explicit User > Learned User > Episode > Semantic
 */

export type MemoryAuthorityLevel =
  | 'REALITY'
  | 'HARD_CONSTRAINT'
  | 'TRIP_SPECIFIC'
  | 'EXPLICIT_USER'
  | 'LEARNED_USER'
  | 'EPISODE'
  | 'SEMANTIC_RECALL';

/** 数字越大优先级越高 */
export const MEMORY_AUTHORITY_RANK: Readonly<
  Record<MemoryAuthorityLevel, number>
> = {
  REALITY: 100,
  HARD_CONSTRAINT: 90,
  TRIP_SPECIFIC: 80,
  EXPLICIT_USER: 70,
  LEARNED_USER: 60,
  EPISODE: 50,
  SEMANTIC_RECALL: 40,
} as const;

export type AuthorityClaim<T = unknown> = {
  level: MemoryAuthorityLevel;
  predicate: string;
  value: T;
  confidence: number;
  sourceRef?: string;
  note?: string;
};

export type AuthorityResolveResult<T = unknown> = {
  predicate: string;
  winner: AuthorityClaim<T>;
  losers: AuthorityClaim<T>[];
  reason: string;
};
