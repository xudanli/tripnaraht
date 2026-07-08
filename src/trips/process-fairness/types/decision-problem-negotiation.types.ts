import type { WishCategory } from '../../wishlist/types/trip-wish.types';
import type { DomainCrossLevel } from '../../domain-influence/types/trip-domain.types';
import type {
  DecisionProblemNegotiationClosedOutcome,
  DecisionProblemNegotiationView,
} from '../../decision-semantics/types/decision-semantics.types';
import type { DecisionNode } from './preference-round.types';

export type NegotiationStartAction =
  | 'created'
  | 'enter_existing'
  | 'claim_required';

export type NegotiationPreflightBlockReason =
  | 'INSUFFICIENT_MEMBERS'
  | 'SOLO_TRIP_NOT_SUPPORTED'
  | 'PROBLEM_NOT_NEGOTIABLE'
  | 'PROBLEM_NOT_ELIGIBLE'
  | 'NEGOTIATION_ALREADY_ACTIVE'
  | 'DOMAIN_ROUND_CONFLICT'
  | 'CLAIM_REQUIRED';

export interface StartDecisionProblemNegotiationBody {
  focusConflictId?: string;
  selectedOptionId?: string;
  note?: string;
  closesAt?: string;
  /** 中/高交叉领域未认领时自动为发起人认领（默认 true） */
  autoClaimDomain?: boolean;
}

export interface NegotiationPrefillOption {
  id: string;
  label: string;
}

export interface NegotiationPrefill {
  title: string;
  question: string;
  options: NegotiationPrefillOption[];
  selectedOptionId?: string;
  note?: string;
  focusConflictId?: string;
}

export interface NegotiationClientNavigation {
  route: 'structured_negotiation';
  tripId: string;
  roundId: string;
  roundDomain: WishCategory;
  problemId: string;
}

export interface DecisionProblemNegotiationBinding {
  roundId: string;
  domain: WishCategory;
  decisionNode: DecisionNode;
  focusConflictId?: string;
  selectedOptionId?: string;
  note?: string;
  createdAt: string;
  createdBy: string;
  /** P1 — written when preference round closes */
  outcome?: DecisionProblemNegotiationClosedOutcome;
}

export interface TripDecisionNegotiationMetadata {
  byProblemId: Record<string, DecisionProblemNegotiationBinding>;
}

export interface NegotiationPreflightResult {
  canStart: boolean;
  blockReason: NegotiationPreflightBlockReason | null;
  blockMessageCN: string | null;
  suggestedDomain: WishCategory;
  suggestedDecisionNode: DecisionNode;
  crossLevel: DomainCrossLevel;
  requiresDomainClaim: boolean;
  claimDomain?: WishCategory;
  userHasDomainClaim: boolean;
  existingRoundId: string | null;
  existingTaskStatus: 'pending' | 'in_discussion' | 'consensus_reached' | null;
  negotiationTaskId: string;
  existingProblemIdForRound: string | null;
}

export interface StartDecisionProblemNegotiationResult {
  action: NegotiationStartAction;
  negotiationTaskId: string;
  roundId: string;
  roundDomain: WishCategory;
  decisionNode: DecisionNode;
  status: 'in_discussion';
  clientNavigation: NegotiationClientNavigation;
  prefill: NegotiationPrefill;
  claimRequired?: {
    domain: WishCategory;
    crossLevel: DomainCrossLevel;
    unclaimed: boolean;
    userHasClaim: boolean;
  };
}

export interface DomainRoundConflictDetails {
  code: 'DOMAIN_ROUND_CONFLICT';
  existingRoundId: string;
  existingProblemId: string | null;
  roundDomain: WishCategory;
  messageCN: string;
}

export type DecisionProblemNegotiationStatus =
  | 'none'
  | 'pending'
  | 'in_discussion'
  | 'closed';

export interface DecisionProblemNegotiationHints {
  suggestedNegotiationDomain: WishCategory;
  suggestedDecisionNode: DecisionNode;
  negotiation: DecisionProblemNegotiationView;
}
