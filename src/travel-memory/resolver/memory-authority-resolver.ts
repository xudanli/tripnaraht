/**
 * Memory Authority Resolver — 冲突时按冻结层级取胜。
 */

import {
  MEMORY_AUTHORITY_RANK,
  type AuthorityClaim,
  type AuthorityResolveResult,
} from '../types/authority-hierarchy.types';

/**
 * 同 predicate 多主张：Authority Rank 优先，同分比 confidence。
 */
export function resolveAuthorityConflict<T = unknown>(
  predicate: string,
  claims: AuthorityClaim<T>[],
): AuthorityResolveResult<T> | null {
  if (!claims.length) return null;
  const ranked = [...claims].sort((a, b) => {
    const dr =
      MEMORY_AUTHORITY_RANK[b.level] - MEMORY_AUTHORITY_RANK[a.level];
    if (dr !== 0) return dr;
    return b.confidence - a.confidence;
  });
  const winner = ranked[0];
  const losers = ranked.slice(1);
  return {
    predicate,
    winner,
    losers,
    reason: `authority=${winner.level} rank=${MEMORY_AUTHORITY_RANK[winner.level]} conf=${winner.confidence}`,
  };
}

/**
 * 便捷：User pace vs Trip pace vs Reality fatigue 等。
 */
export function resolvePaceConflict(input: {
  worldFatigueHigh?: boolean;
  tripPace?: string | null;
  tripConfidence?: number;
  explicitUserPace?: string | null;
  explicitUserConfidence?: number;
  learnedUserPace?: string | null;
  learnedUserConfidence?: number;
}): AuthorityResolveResult<string> | null {
  const claims: AuthorityClaim<string>[] = [];

  if (input.worldFatigueHigh) {
    claims.push({
      level: 'REALITY',
      predicate: 'travel.pace',
      value: 'RELAXED',
      confidence: 1,
      note: 'driver_fatigue=HIGH forces conservative pace today',
    });
  }
  if (input.tripPace) {
    claims.push({
      level: 'TRIP_SPECIFIC',
      predicate: 'travel.pace',
      value: input.tripPace,
      confidence: input.tripConfidence ?? 0.9,
    });
  }
  if (input.explicitUserPace) {
    claims.push({
      level: 'EXPLICIT_USER',
      predicate: 'travel.pace',
      value: input.explicitUserPace,
      confidence: input.explicitUserConfidence ?? 1,
    });
  }
  if (input.learnedUserPace) {
    claims.push({
      level: 'LEARNED_USER',
      predicate: 'travel.pace',
      value: input.learnedUserPace,
      confidence: input.learnedUserConfidence ?? 0.6,
    });
  }

  return resolveAuthorityConflict('travel.pace', claims);
}
