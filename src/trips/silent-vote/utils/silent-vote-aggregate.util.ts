import type {
  IntensityBucketKey,
  SilentVoteAggregate,
  SilentVoteDiscussionHint,
  SilentVoteIntensityHeatmapRow,
  SilentVoteOption,
  SilentVoteOptionDistribution,
  SilentVoteStatus,
} from '../types/silent-vote.types';

export const K_ANONYMITY_MIN_SUBMISSIONS = 3;
export const MINORITY_SHARE_THRESHOLD = 0.35;
export const HIGH_INTENSITY_THRESHOLD = 4;

export interface BallotInput {
  optionId: string;
  intensity: number;
}

export function emptyIntensityBuckets(): Record<IntensityBucketKey, number> {
  return { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
}

export function clampIntensity(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

export function buildSilentVoteAggregate(args: {
  voteId: string;
  status: SilentVoteStatus;
  options: SilentVoteOption[];
  ballots: BallotInput[];
  eligibleCount: number;
}): SilentVoteAggregate {
  const { voteId, status, options, ballots, eligibleCount } = args;
  const submittedCount = ballots.length;
  const participationRate =
    eligibleCount > 0 ? submittedCount / eligibleCount : 0;

  const kAnonymityApplied =
    status === 'open' && submittedCount > 0 && submittedCount < K_ANONYMITY_MIN_SUBMISSIONS;

  if (submittedCount === 0 || kAnonymityApplied) {
    return {
      voteId,
      status,
      eligibleCount,
      submittedCount,
      participationRate,
      kAnonymityApplied,
      optionDistribution: null,
      intensityHeatmap: null,
      overallIntensity: null,
      discussionHints: [],
    };
  }

  const optionDistribution = buildOptionDistribution(options, ballots);
  const intensityHeatmap = buildIntensityHeatmap(options, ballots);
  const overallIntensity = buildOverallIntensity(ballots);
  const discussionHints =
    status === 'closed' || submittedCount >= K_ANONYMITY_MIN_SUBMISSIONS
      ? detectHighIntensityMinority(optionDistribution, intensityHeatmap)
      : [];

  return {
    voteId,
    status,
    eligibleCount,
    submittedCount,
    participationRate,
    kAnonymityApplied: false,
    optionDistribution,
    intensityHeatmap,
    overallIntensity,
    discussionHints,
  };
}

function buildOptionDistribution(
  options: SilentVoteOption[],
  ballots: BallotInput[],
): SilentVoteOptionDistribution[] {
  const total = ballots.length;
  const counts = new Map<string, number>();
  for (const b of ballots) {
    counts.set(b.optionId, (counts.get(b.optionId) ?? 0) + 1);
  }

  return options.map((opt) => {
    const count = counts.get(opt.id) ?? 0;
    return {
      optionId: opt.id,
      label: opt.label,
      count,
      share: total > 0 ? count / total : 0,
    };
  });
}

function buildIntensityHeatmap(
  options: SilentVoteOption[],
  ballots: BallotInput[],
): SilentVoteIntensityHeatmapRow[] {
  return options.map((opt) => {
    const rows = ballots.filter((b) => b.optionId === opt.id);
    const buckets = emptyIntensityBuckets();
    let sum = 0;
    for (const row of rows) {
      const key = String(clampIntensity(row.intensity)) as IntensityBucketKey;
      buckets[key] += 1;
      sum += clampIntensity(row.intensity);
    }
    const count = rows.length;
    const meanIntensity = count > 0 ? sum / count : 0;
    return {
      optionId: opt.id,
      label: opt.label,
      buckets,
      meanIntensity,
      weightedScore: count * meanIntensity,
    };
  });
}

function buildOverallIntensity(ballots: BallotInput[]) {
  const buckets = emptyIntensityBuckets();
  let sum = 0;
  for (const b of ballots) {
    const i = clampIntensity(b.intensity);
    buckets[String(i) as IntensityBucketKey] += 1;
    sum += i;
  }
  return {
    mean: ballots.length > 0 ? sum / ballots.length : 0,
    buckets,
  };
}

export function detectHighIntensityMinority(
  optionDistribution: SilentVoteOptionDistribution[],
  intensityHeatmap: SilentVoteIntensityHeatmapRow[],
): SilentVoteDiscussionHint[] {
  const hints: SilentVoteDiscussionHint[] = [];

  for (const opt of optionDistribution) {
    if (opt.share >= MINORITY_SHARE_THRESHOLD) continue;

    const heat = intensityHeatmap.find((h) => h.optionId === opt.optionId);
    const highCount = (heat?.buckets['4'] ?? 0) + (heat?.buckets['5'] ?? 0);
    if (highCount < 1) continue;

    hints.push({
      type: 'HIGH_INTENSITY_MINORITY',
      optionId: opt.optionId,
      optionLabel: opt.label,
      minorityShare: opt.share,
      highIntensityCount: highCount,
      messageCN:
        `「${opt.label}」得票较少（${Math.round(opt.share * 100)}%），` +
        `但有 ${highCount} 位成员对此选择非常在意，建议进一步讨论。`,
      severity: highCount >= 2 || opt.share < 0.2 ? 'high' : 'medium',
    });
  }

  return hints;
}
