export const SILENT_VOTE_STATUSES = ['draft', 'open', 'closed'] as const;
export type SilentVoteStatus = (typeof SILENT_VOTE_STATUSES)[number];

export interface SilentVoteOption {
  id: string;
  label: string;
  planId?: string;
  summaryRef?: string;
}

export interface SilentVoteRecord {
  id: string;
  tripId: string;
  createdBy: string;
  title: string;
  question: string | null;
  status: SilentVoteStatus;
  options: SilentVoteOption[];
  closesAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SilentVoteBallotRecord {
  optionId: string;
  intensity: number;
  submittedAt: string;
  updatedAt: string;
}

export type IntensityBucketKey = '1' | '2' | '3' | '4' | '5';

export interface SilentVoteOptionDistribution {
  optionId: string;
  label: string;
  count: number;
  share: number;
}

export interface SilentVoteIntensityHeatmapRow {
  optionId: string;
  label: string;
  buckets: Record<IntensityBucketKey, number>;
  meanIntensity: number;
  weightedScore: number;
}

export interface SilentVoteDiscussionHint {
  type: 'HIGH_INTENSITY_MINORITY';
  optionId: string;
  optionLabel: string;
  minorityShare: number;
  highIntensityCount: number;
  messageCN: string;
  severity: 'medium' | 'high';
}

export interface SilentVoteAggregate {
  voteId: string;
  status: SilentVoteStatus;
  eligibleCount: number;
  submittedCount: number;
  participationRate: number;
  kAnonymityApplied: boolean;
  optionDistribution: SilentVoteOptionDistribution[] | null;
  intensityHeatmap: SilentVoteIntensityHeatmapRow[] | null;
  overallIntensity: {
    mean: number;
    buckets: Record<IntensityBucketKey, number>;
  } | null;
  discussionHints: SilentVoteDiscussionHint[];
}

export interface SilentVoteDetail extends SilentVoteRecord {
  aggregate: SilentVoteAggregate;
  myBallotSubmitted: boolean;
}
