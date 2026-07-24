/**
 * M6 — Bounded local repair candidate selection (day / item scope).
 */

import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import type { ReplanningScope } from '../trigger/replanning-trigger-decision.util';

export function selectBoundedRepairCandidate(
  candidates: DecisionCandidate[],
  scope: ReplanningScope = 'DAY',
): DecisionCandidate | undefined {
  if (!candidates.length) return undefined;

  const scoped = candidates.filter((c) => {
    if (c.source === 'NEPTUNE_REPAIR' || c.source === 'RULE_BASED_REPAIR') {
      return true;
    }
    const label = c.label.toLowerCase();
    return label.includes('repair') || label.includes('local');
  });

  return scoped[0] ?? candidates[0];
}

export function boundedRepairSummary(
  scope: ReplanningScope,
  candidateId?: string,
): string {
  return `bounded-lns scope=${scope} selected=${candidateId ?? 'none'}`;
}
