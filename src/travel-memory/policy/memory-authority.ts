/**
 * 将 Memory 来源映射到 Authority Level（供 Resolver 使用）。
 */

import type { MemoryAuthorityLevel } from '../types/authority-hierarchy.types';
import type { MemoryScope } from '../types/memory-scope.types';
import type { MemorySourceType, MemoryEventStatus } from '../types/memory-event.types';

export function authorityLevelForMemory(input: {
  scope: MemoryScope;
  sourceType: MemorySourceType;
  status?: MemoryEventStatus;
  isWorldState?: boolean;
  isHardConstraint?: boolean;
}): MemoryAuthorityLevel {
  if (input.isWorldState) return 'REALITY';
  if (input.isHardConstraint) return 'HARD_CONSTRAINT';

  if (
    input.scope === 'TRIP' ||
    input.scope === 'TRIP_MEMBER' ||
    input.scope === 'TEAM' ||
    input.scope === 'DAY'
  ) {
    return 'TRIP_SPECIFIC';
  }

  if (input.sourceType === 'USER_EXPLICIT') return 'EXPLICIT_USER';
  if (input.status === 'INFERRED' || input.sourceType === 'STRONG_INFERENCE') {
    return 'LEARNED_USER';
  }
  if (
    input.sourceType === 'DECISION_OUTCOME' ||
    input.scope === 'DECISION'
  ) {
    return 'EPISODE';
  }
  if (input.sourceType === 'WEAK_SIGNAL' || input.sourceType === 'IMPORT') {
    return 'SEMANTIC_RECALL';
  }
  return 'LEARNED_USER';
}
