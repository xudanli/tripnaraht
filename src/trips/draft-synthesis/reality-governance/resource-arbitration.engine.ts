import type { RealityResource } from './reality-resource.types';
import type { ResourceClaim } from './resource-claim.types';
import type { GovernancePolicyMode } from './governance-policy.types';
import type { AllocationOutcome } from './allocation.types';

function groupKey(c: ResourceClaim): string {
  return `${c.resourceId}::${c.slotKey ?? '*'}`;
}

function scoreClaim(c: ResourceClaim, mode: GovernancePolicyMode): number {
  const hist = c.historicalLoadHint ?? 0;
  switch (mode) {
    case 'PRIORITY':
      return 0.55 * c.priorityScore + 0.45 * c.urgencyScore;
    case 'EFFICIENCY':
      return c.priorityScore * c.urgencyScore + 0.15 * c.urgencyScore;
    case 'FAIRNESS':
    default:
      return 0.5 * c.priorityScore + 0.5 * (1 / (1 + hist));
  }
}

/**
 * 对同一 resourceId(+slotKey) 的竞争声明排序仲裁；超额需求仅第一名获准（v0 单席语义）。
 * capacity>1 时可扩展为取 top-k。
 */
export function arbitrateResourceClaims(
  claims: ResourceClaim[],
  resources: Map<string, RealityResource>,
  mode: GovernancePolicyMode,
): AllocationOutcome[] {
  const byGroup = new Map<string, ResourceClaim[]>();
  for (const c of claims) {
    const k = groupKey(c);
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k)!.push(c);
  }

  const outcomes: AllocationOutcome[] = [];

  for (const [, group] of byGroup) {
    if (group.length <= 1) continue;

    const resourceId = group[0].resourceId;
    const slotKey = group[0].slotKey;
    const res = resources.get(resourceId);
    const cap = res?.capacity ?? 1;
    const ranked = [...group].sort((a, b) => scoreClaim(b, mode) - scoreClaim(a, mode));

    const winners = ranked.slice(0, Math.max(1, Math.floor(cap)));
    const winner = winners[0];
    const losers = ranked.slice(winners.length);

    const rejected = losers.map((l) => ({
      tripId: l.tripId,
      compensation:
        mode === 'FAIRNESS'
          ? '建议错峰时段或等价备选 POI（公平队列）'
          : mode === 'EFFICIENCY'
            ? '建议改订低冲突时段以提升系统吞吐'
            : '建议根据优先级通道改签或候补',
    }));

    outcomes.push({
      resourceId,
      slotKey,
      winnerTripId: winner.tripId,
      policyApplied: mode,
      reason: `${mode} 评分 ${scoreClaim(winner, mode).toFixed(4)}（capacity=${cap}）`,
      rejected,
    });
  }

  return outcomes;
}
