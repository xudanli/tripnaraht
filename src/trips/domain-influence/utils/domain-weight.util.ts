import type { DomainWeightSource } from '../types/trip-domain.types';

export interface ActiveClaimInput {
  userId: string;
  selfScore: number;
  endorsementCount: number;
  stakeScore?: number;
  payerScore?: number;
}

export interface WeightOverrideInput {
  userId: string;
  weight: number;
}

export interface ComputedMemberWeight {
  userId: string;
  weight: number;
  selfScore: number;
  peerTrustScore: number;
  stakeScore: number;
  payerScore: number;
  isLeader: boolean;
}

/**
 * Default influence rule (product simplification):
 * - single claimer → 100% leader
 * - multiple claimers → equal split
 * Overrides (post structured negotiation) replace computed weights when present.
 */
export function computeDomainWeights(
  claims: ActiveClaimInput[],
  overrides: WeightOverrideInput[] | undefined,
  eligibleMemberCount: number,
): { weights: ComputedMemberWeight[]; source: DomainWeightSource } {
  if (overrides && overrides.length > 0) {
    const normalized = normalizeOverrideWeights(overrides);
    return {
      source: 'negotiation',
      weights: normalized.map((o) => {
        const claim = claims.find((c) => c.userId === o.userId);
        return buildWeightRow(o.userId, o.weight, claim, eligibleMemberCount);
      }),
    };
  }

  if (claims.length === 0) {
    return { weights: [], source: 'computed' };
  }

  const equalWeight = 1 / claims.length;
  const weights = claims.map((c) =>
    buildWeightRow(c.userId, equalWeight, c, eligibleMemberCount),
  );

  if (claims.length === 1) {
    weights[0].isLeader = true;
  }

  return { weights, source: 'computed' };
}

function buildWeightRow(
  userId: string,
  weight: number,
  claim: ActiveClaimInput | undefined,
  eligibleMemberCount: number,
): ComputedMemberWeight {
  const selfScore = claim?.selfScore ?? 50;
  const endorsements = claim?.endorsementCount ?? 0;
  const peerTrustScore = eligibleMemberCount <= 1
    ? 100
    : Math.round(Math.min(100, (endorsements / Math.max(eligibleMemberCount - 1, 1)) * 100));

  return {
    userId,
    weight,
    selfScore,
    peerTrustScore,
    stakeScore: claim?.stakeScore ?? 50,
    payerScore: claim?.payerScore ?? 50,
    isLeader: weight >= 0.999,
  };
}

export function normalizeOverrideWeights(
  overrides: WeightOverrideInput[],
): WeightOverrideInput[] {
  const positive = overrides.filter((o) => o.weight > 0);
  if (positive.length === 0) {
    throw new Error('权重覆盖至少需一位成员 weight > 0');
  }
  const sum = positive.reduce((acc, o) => acc + o.weight, 0);
  return positive.map((o) => ({ userId: o.userId, weight: o.weight / sum }));
}

export function toWeightPercent(weight: number): number {
  return Math.round(weight * 1000) / 10;
}

/** F2.2 balance check — member is lowest in every domain they participate in. */
export function findGlobalLowInfluenceMembers(
  memberIds: string[],
  domainWeightsByMember: Map<string, Map<string, number>>,
): string[] {
  const warnings: string[] = [];
  for (const memberId of memberIds) {
    const participations: number[] = [];
    for (const [, weights] of domainWeightsByMember) {
      if (!weights.has(memberId)) continue;
      const values = [...weights.values()];
      const min = Math.min(...values);
      if (weights.get(memberId) === min) {
        participations.push(min);
      }
    }
    const domainCount = [...domainWeightsByMember.values()].filter((w) =>
      w.has(memberId),
    ).length;
    if (domainCount > 0 && participations.length === domainCount) {
      warnings.push(memberId);
    }
  }
  return warnings;
}
