/** Replay-safe trip intent digests — summaries for agent decision context. */

export type TripIntentDigestRevision = 'v1';

export interface DomainLeaderDigestV1 {
  domain: string;
  domainLabel: string;
  leaderUserId: string | null;
  leaderWeightPercent: number | null;
  crossLevel: string;
  unclaimed: boolean;
}

/** Domain influence governance snapshot for route_and_run replay / audit. */
export interface DomainInfluenceDigestV1 {
  revision: TripIntentDigestRevision;
  memberCount: number;
  completionRate: number;
  rulesConfirmed: boolean;
  balanceWarningCount: number;
  domains: DomainLeaderDigestV1[];
}

/** Aggregated wish constraints (structured hints only — no wish body text). */
export interface WishConstraintDigestV1 {
  revision: TripIntentDigestRevision;
  teamActiveCount: number;
  privateActiveCount: number;
  requestingUserPrivateCount: number;
  mustDo: string[];
  mustAvoid: string[];
}

/** Requesting user's private wish lines (for agent planning — not other members' text). */
export interface PrivateWishLineDigestV1 {
  category: string;
  importance: number;
  text: string;
}

export interface PrivateWishDigestV1 {
  revision: TripIntentDigestRevision;
  requestingUserItemCount: number;
  items: PrivateWishLineDigestV1[];
}

/** Team decision style / Money DNA summary (PDI-4). */
export interface DecisionProfilingDigestV1 {
  revision: TripIntentDigestRevision;
  teamCompletionRate: number;
  requestingUserQuizCompleted: boolean;
  requestingUserStyleLabel: string | null;
  requestingUserTeamRole: string | null;
  requestingUserMoneyDnaSummary: string | null;
  teamStyleLabels: string[];
  highRiskFrictionDomains: string[];
  splitMechanismLocked: boolean;
  splitMechanismMode: string | null;
}

export interface CollaborativeTaskDigestV1 {
  domain: string;
  title: string;
  status: string;
  statusLabel: string;
  crossLevel: string;
  leaderDisplayName: string | null;
}

/** Domain negotiation + guardian debate outcomes for agent decision. */
export interface NegotiationDigestV1 {
  revision: TripIntentDigestRevision;
  collaborativeTasks: CollaborativeTaskDigestV1[];
  guardianConsensusLevel: number | null;
  guardianSummary: string | null;
  guardianHumanDecisionPointCount: number;
  splitMechanismMode: string | null;
  splitMechanismLocked: boolean;
}
