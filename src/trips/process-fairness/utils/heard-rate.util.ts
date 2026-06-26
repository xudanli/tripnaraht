export const HEARD_RATE_THRESHOLD = 0.8;

export interface HeardVoteRow {
  targetUserId: string;
  heard: boolean;
}

export interface HeardRateResult {
  targetUserId: string;
  heardRate: number;
  voteCount: number;
  belowThreshold: boolean;
}

export function computeHeardRates(
  votes: HeardVoteRow[],
  eligibleVoterCount: number,
): HeardRateResult[] {
  const byTarget = new Map<string, { yes: number; total: number }>();

  for (const v of votes) {
    const prev = byTarget.get(v.targetUserId) ?? { yes: 0, total: 0 };
    prev.total += 1;
    if (v.heard) prev.yes += 1;
    byTarget.set(v.targetUserId, prev);
  }

  const results: HeardRateResult[] = [];
  for (const [targetUserId, counts] of byTarget) {
    const voteCount = counts.total;
    const heardRate = voteCount > 0 ? counts.yes / voteCount : 0;
    results.push({
      targetUserId,
      heardRate,
      voteCount,
      belowThreshold: voteCount > 0 && heardRate < HEARD_RATE_THRESHOLD,
    });
  }

  // Members with zero votes yet — not below threshold until votes exist
  void eligibleVoterCount;
  return results.sort((a, b) => a.heardRate - b.heardRate);
}

export function buildHeardInterventions(
  rates: HeardRateResult[],
  displayNames: Map<string, string>,
): Array<{
  targetUserId: string;
  displayName: string;
  heardRate: number;
  messageCN: string;
}> {
  return rates
    .filter((r) => r.belowThreshold)
    .map((r) => {
      const name = displayNames.get(r.targetUserId) ?? '这位成员';
      return {
        targetUserId: r.targetUserId,
        displayName: name,
        heardRate: r.heardRate,
        messageCN: `我们需要再给${name}一个表达机会——「被听见」反馈尚未达到共识（${Math.round(r.heardRate * 100)}%）。`,
      };
    });
}

export function allHeardVotesComplete(
  voterCount: number,
  targetCount: number,
  submittedVoteRows: number,
): boolean {
  const expected = voterCount * targetCount;
  return expected > 0 && submittedVoteRows >= expected;
}
