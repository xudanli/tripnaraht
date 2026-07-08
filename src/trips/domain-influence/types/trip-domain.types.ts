import type { WishCategory } from '../../wishlist/types/trip-wish.types';

/** F2.3 — domain cross-intersection level */
export type DomainCrossLevel = 'low' | 'medium' | 'high';

export type DomainClaimSource = 'explicit' | 'recommended';
export type DomainClaimStatus = 'active' | 'withdrawn';
export type DomainWeightSource = 'computed' | 'negotiation' | 'manual';

export interface DomainDecisionRule {
  crossLevel: DomainCrossLevel;
  ruleLabelZh: string;
  expertCanDecideAlone: boolean;
  requiresTeamVote: boolean;
  requiresFullTeamDiscussion: boolean;
}

export interface TripDomainClaimRecord {
  id: string;
  tripId: string;
  domain: WishCategory;
  userId: string;
  claimSource: DomainClaimSource;
  selfScore: number;
  note: string | null;
  status: DomainClaimStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DomainMemberWeight {
  userId: string;
  displayName: string;
  weight: number;
  weightPercent: number;
  isLeader: boolean;
  selfScore: number;
  peerTrustScore: number;
  stakeScore: number;
  payerScore: number;
  endorsementCount: number;
  claimSource: DomainClaimSource;
}

export interface TripDomainBreakdownItem {
  domain: WishCategory;
  domainLabel: string;
  decisionRule: DomainDecisionRule;
  claims: Array<{
    id: string;
    userId: string;
    displayName: string;
    claimSource: DomainClaimSource;
    selfScore: number;
    note: string | null;
    endorsementCount: number;
    endorsementTotal: number;
    endorsedByCurrentUser: boolean;
  }>;
  weights: DomainMemberWeight[];
  leaderUserId: string | null;
  leaderDisplayName: string | null;
  weightSource: DomainWeightSource;
  unclaimed: boolean;
  /** Itinerary items / days this domain may affect (when known) */
  impactHints?: string[];
}

export interface TripDomainInfluenceSnapshot {
  tripId: string;
  memberCount: number;
  domains: TripDomainBreakdownItem[];
  completionRate: number;
  allMembersClaimed: boolean;
  balanceWarnings: DomainBalanceWarning[];
  rulesConfirmed: boolean;
  rulesConfirmedAt: string | null;
}

export interface DomainBalanceWarning {
  userId: string;
  displayName: string;
  message: string;
}

export interface DomainPrivateWishConstraint {
  wishId: string;
  importance: number;
  text: string;
  structuredHints: Record<string, unknown> | null;
  /** Member index for agent weighting — not exposed to other humans in UI */
  memberSlot: number;
}

/** Per-domain private wish bundle for domain leaders (Context Engineer / agent). */
export interface DomainLeaderPrivateConstraintBundle {
  domain: WishCategory;
  domainLabel: string;
  constraints: DomainPrivateWishConstraint[];
}

/** Payload for `buildDomainInfluenceContextBlocks` — not persisted in AgentMemoryContext. */
export interface DomainInfluenceAgentContextPayload {
  tripId: string;
  userId: string;
  snapshot: TripDomainInfluenceSnapshot;
  /** Populated when `includePrivate` and user holds active claims on domain(s). */
  leaderPrivateBundles: DomainLeaderPrivateConstraintBundle[];
}

export interface DomainDecisionBrief {
  domain: WishCategory;
  domainLabel: string;
  crossLevel: DomainCrossLevel;
  leaderUserIds: string[];
  weights: DomainMemberWeight[];
  privateWishConstraints: DomainPrivateWishConstraint[];
  privateWishCount: number;
}

export interface DomainRecommendation {
  domain: WishCategory;
  domainLabel: string;
  score: number;
  reason: string;
}

export type CollaborativeTaskStatus = 'pending' | 'in_discussion' | 'consensus_reached';

export type CollaborativeTaskSource = 'domain_influence' | 'decision_problem';

export interface CollaborativeTaskItem {
  id: string;
  /** 协商任务 ID（decision_problem 时为 nt:{problemId}） */
  negotiationTaskId?: string;
  /** domain_influence = F2.3 领域交叉任务；decision_problem = 决策问题预生成协商入口 */
  source: CollaborativeTaskSource;
  /** 当 source=decision_problem 时，对应 GET decision-problems/:problemId */
  problemId?: string | null;
  /** FE 契约别名，与 problemId 相同 */
  decisionProblemId?: string | null;
  /** 用户提交决策结论后绑定（Phase 3） */
  resolutionId?: string | null;
  actionPlanId?: string | null;
  /** 发起协商时的 focusConflictId（decision-checker 焦点） */
  sourceConflictId?: string | null;
  domain: WishCategory;
  title: string;
  description: string;
  crossLevel: DomainCrossLevel;
  status: CollaborativeTaskStatus;
  statusLabel: string;
  claimCount: number;
  leaderDisplayName: string | null;
  endorsementSummary: string | null;
  weightSource: DomainWeightSource;
  /** ISO8601 — optional discussion deadline */
  closesAt: string | null;
  /** Active F3.1 preference round when status is in_discussion */
  activeRoundId: string | null;
  /** decision_problem 协作跟进子任务（POST .../collaborative-sub-tasks） */
  isSubTask?: boolean;
  subTaskKind?: string;
  subTaskStatus?: string;
  /** 子任务负责人（isSubTask 时；任务分工 Tab 按此筛选） */
  assigneeUserId?: string | null;
  /** 关联决策问题标题（BFF 展示用，避免多条子任务同名） */
  problemTitle?: string | null;
}
