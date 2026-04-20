/**
 * Shared CGUS replay observability (rates + rank snapshots) for report JSON + baseline diff.
 * Kept small and stable: not a mirror of CGUSSearchService internals.
 */

export const CGUS_REPLAY_OBSERVABILITY_SCHEMA_VERSION = 'cgus-replay-observability/v1' as const;

export type RankAuthorityRateRow = {
  mcEligibleForRerank?: boolean;
  winnerChanged?: boolean;
  winnerLockedButTopNChanged?: boolean;
  marginBlockedFlip?: boolean;
};

export type RankReplaySnapshotV1 = {
  schemaVersion: 'cgus-replay-rank-snapshot/v1';
  compareTopN: number;
  /** Utility-sorted top-N (deterministic ordering). */
  deterministicTopN: string[];
  /** CGUS output order top-N (post rerank / margin semantics). */
  finalTopN: string[];
};

export type CgusReplayObservabilityV1 = {
  schemaVersion: typeof CGUS_REPLAY_OBSERVABILITY_SCHEMA_VERSION;
  generatedAt: string;
  runTimestamp: string;
  corpus: string;
  caseCount: number;
  /** Single fixture contract version when all cases agree; otherwise null. */
  fixtureVersion: string | null;
  fixtureVersionsDistinct?: string[];
  rankAuthorityRates: {
    mcEligibleRate: number;
    winnerChangedRate: number;
    winnerLockedButTopNChangedRate: number;
    marginBlockedFlipRate: number;
  };
  counts: {
    total: number;
    eligible: number;
    winnerChanged: number;
    winnerLockedButTopNChanged: number;
    marginBlockedFlip: number;
  };
};

export function computeRankAuthorityRates(rows: RankAuthorityRateRow[]): {
  mcEligibleRate: number;
  winnerChangedRate: number;
  winnerLockedButTopNChangedRate: number;
  marginBlockedFlipRate: number;
  counts: CgusReplayObservabilityV1['counts'];
} {
  const total = rows.length || 1;
  const eligible = rows.filter((x) => x.mcEligibleForRerank === true).length;
  const winnerChanged = rows.filter((x) => x.winnerChanged === true).length;
  const winnerLockedButTopNChanged = rows.filter((x) => x.winnerLockedButTopNChanged === true).length;
  const marginBlockedFlip = rows.filter((x) => x.marginBlockedFlip === true).length;
  return {
    mcEligibleRate: eligible / total,
    winnerChangedRate: winnerChanged / total,
    winnerLockedButTopNChangedRate: winnerLockedButTopNChanged / total,
    marginBlockedFlipRate: marginBlockedFlip / total,
    counts: {
      total: rows.length,
      eligible,
      winnerChanged,
      winnerLockedButTopNChanged,
      marginBlockedFlip,
    },
  };
}

export function buildRankReplaySnapshotV1(
  ranked: Array<{ candidate?: { id?: string }; utility?: number; expectedUtility?: number }> | undefined,
  compareTopN: number,
): RankReplaySnapshotV1 {
  const rankedArr = ranked ?? [];
  const k = Math.max(2, Math.min(10, compareTopN ?? 5));
  const finalTopN = rankedArr
    .slice(0, k)
    .map((r) => r.candidate?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const detSorted = [...rankedArr].sort((a, b) => {
    const du = (b.utility ?? -Infinity) - (a.utility ?? -Infinity);
    if (du !== 0) return du;
    return String(a.candidate?.id ?? '').localeCompare(String(b.candidate?.id ?? ''));
  });
  const deterministicTopN = detSorted
    .slice(0, k)
    .map((r) => r.candidate?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return {
    schemaVersion: 'cgus-replay-rank-snapshot/v1',
    compareTopN: k,
    deterministicTopN,
    finalTopN,
  };
}

export function collectFixtureVersionsFromCases(
  cases: Array<{ metadata?: { cgusDsoFixtureVersion?: string } }>,
): { primary: string | null; distinct: string[] } {
  const versions = cases
    .map((c) => c.metadata?.cgusDsoFixtureVersion)
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  const distinct = [...new Set(versions)].sort();
  return { primary: distinct.length === 1 ? distinct[0]! : null, distinct };
}

export function buildObservabilityV1(input: {
  generatedAt: string;
  corpus: string;
  caseCount: number;
  fixtureVersion: string | null;
  fixtureVersionsDistinct?: string[];
  rankAuthorityRows: RankAuthorityRateRow[];
}): CgusReplayObservabilityV1 {
  const rates = computeRankAuthorityRates(input.rankAuthorityRows);
  const obs: CgusReplayObservabilityV1 = {
    schemaVersion: CGUS_REPLAY_OBSERVABILITY_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    runTimestamp: input.generatedAt,
    corpus: input.corpus,
    caseCount: input.caseCount,
    fixtureVersion: input.fixtureVersion,
    rankAuthorityRates: {
      mcEligibleRate: rates.mcEligibleRate,
      winnerChangedRate: rates.winnerChangedRate,
      winnerLockedButTopNChangedRate: rates.winnerLockedButTopNChangedRate,
      marginBlockedFlipRate: rates.marginBlockedFlipRate,
    },
    counts: rates.counts,
  };
  if (input.fixtureVersionsDistinct && input.fixtureVersionsDistinct.length > 1) {
    obs.fixtureVersionsDistinct = input.fixtureVersionsDistinct;
  }
  return obs;
}
