import type { QueryRewriteScene } from '../utils/query-rewriting.types';

export const ER_ALIAS_PREFIX = 'tripnara:er:alias';
export const ER_CANDIDATES_PREFIX = 'tripnara:er:candidates';

export function erAliasKey(scene: string, normalizedAlias: string): string {
  return `${ER_ALIAS_PREFIX}:${scene}:${normalizedAlias}`;
}

export function erCandidatesKey(scene: string): string {
  return `${ER_CANDIDATES_PREFIX}:${scene}`;
}

/** 查询改写场景 + general 兜底 */
export function erScenesForLookup(scene?: QueryRewriteScene | string): string[] {
  const s = (scene ?? 'general').trim() || 'general';
  return s === 'general' ? ['general'] : [s, 'general'];
}
