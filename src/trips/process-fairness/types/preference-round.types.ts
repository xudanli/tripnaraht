import type { WishCategory } from '../../wishlist/types/trip-wish.types';

export const PREFERENCE_ROUND_STATUSES = ['collecting', 'synthesizing', 'closed'] as const;
export type PreferenceRoundStatus = (typeof PREFERENCE_ROUND_STATUSES)[number];

export const DECISION_NODES = ['destination', 'accommodation', 'activity', 'budget'] as const;
export type DecisionNode = (typeof DECISION_NODES)[number];

export const UTTERANCE_MODALITIES = ['text', 'voice', 'image', 'link'] as const;
export type UtteranceModality = (typeof UTTERANCE_MODALITIES)[number];

/** Maps F3.1 decision nodes to wish domains */
export const DECISION_NODE_TO_DOMAIN: Record<DecisionNode, WishCategory> = {
  destination: 'destination_route',
  accommodation: 'accommodation',
  activity: 'activities',
  budget: 'shopping',
};

/** Reverse map for auto-provisioning rounds from collaborative task domain */
export const DOMAIN_TO_DECISION_NODE: Partial<Record<WishCategory, DecisionNode>> = {
  destination_route: 'destination',
  accommodation: 'accommodation',
  activities: 'activity',
  dining: 'activity',
  shopping: 'budget',
};

export interface PreferenceUtteranceRecord {
  id: string;
  userId: string;
  displayName: string;
  turnIndex: number;
  modality: UtteranceModality;
  content: string;
  reason: string | null;
  viaProxy: boolean;
  createdAt: string;
}

export interface HeardRateEntry {
  targetUserId: string;
  displayName: string;
  heardRate: number;
  voteCount: number;
  belowThreshold: boolean;
}

export interface HeardVoteIntervention {
  targetUserId: string;
  displayName: string;
  heardRate: number;
  messageCN: string;
}

export interface PreferenceRoundDetail {
  id: string;
  tripId: string;
  domain: WishCategory;
  decisionNode: DecisionNode;
  status: PreferenceRoundStatus;
  statusLabel: string;
  turnOrder: string[];
  currentTurn: number;
  currentSpeakerUserId: string | null;
  currentSpeakerDisplayName: string | null;
  closesAt: string | null;
  closedAt: string | null;
  utterances: PreferenceUtteranceRecord[];
  heardRates: HeardRateEntry[] | null;
  interventions: HeardVoteIntervention[];
  canSpeak: boolean;
  canSubmitHeardVotes: boolean;
  myHeardVotesSubmitted: boolean;
}

export interface PreferenceRoundSummary {
  id: string;
  tripId: string;
  domain: WishCategory;
  decisionNode: DecisionNode;
  status: PreferenceRoundStatus;
  statusLabel: string;
  closesAt: string | null;
  utteranceCount: number;
  memberCount: number;
}
