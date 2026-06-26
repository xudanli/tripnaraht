export const WISH_CATEGORIES = [
  'destination_route',
  'main_transport',
  'accommodation',
  'activities',
  'dining',
  'local_transport',
  'shopping',
  'insurance_visa',
] as const;

export type WishCategory = (typeof WISH_CATEGORIES)[number];

export const WISH_VISIBILITIES = ['private', 'anonymous', 'signed'] as const;
export type WishVisibility = (typeof WISH_VISIBILITIES)[number];

export const WISH_INPUT_MODES = [
  'card_select',
  'free_text',
  'voice',
  'inspiration',
  'ai_convert',
] as const;
export type WishInputMode = (typeof WISH_INPUT_MODES)[number];

export const WISH_STATUSES = ['active', 'archived'] as const;
export type WishStatus = (typeof WISH_STATUSES)[number];

export interface WishSourceRef {
  cardId?: string;
  inspirationAssetId?: string;
  aiMessageId?: string;
  voiceTranscriptId?: string;
  assistantSessionId?: string;
}

export interface WishStructuredHints {
  must_do?: string[];
  must_avoid?: string[];
  soft_constraints?: Array<{
    type: string;
    category?: string;
    amount?: number;
    currency?: string;
    note?: string;
  }>;
  tags?: string[];
  pace?: string;
}

export interface TripWishItemRecord {
  id: string;
  tripId: string;
  userId: string;
  category: WishCategory;
  text: string;
  importance: number;
  inputMode: WishInputMode;
  sourceRef: WishSourceRef | null;
  visibility: WishVisibility;
  agentEligible: boolean;
  structuredHints: WishStructuredHints | null;
  status: WishStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WishSuggestionCard {
  id: string;
  category: WishCategory;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  defaultImportance: number;
  defaultText: string;
  structuredHints?: WishStructuredHints;
}

export interface InspirationAsset {
  id: string;
  region: string;
  tags: string[];
  imageUrl: string;
  caption: string;
  relatedPoiIds?: string[];
  seasonHint?: string;
}

export interface TeamWishViewItem {
  id: string;
  category: WishCategory;
  categoryLabel: string;
  text: string;
  importance: number;
  visibility: 'anonymous' | 'signed';
  authorDisplayName?: string;
  createdAt: string;
}

export interface WishAgentSnapshot {
  tripId: string;
  userId: string;
  itemCount: number;
  privateSummaryText: string;
  teamSummaryText: string;
  structured: {
    must_do: string[];
    must_avoid: string[];
    soft_constraints: WishStructuredHints['soft_constraints'];
    importance_weighted_intents: Record<string, number>;
  };
  items: TripWishItemRecord[];
}

export interface WishAssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  sources?: string[];
}

export interface WishAssistantChatResult {
  sessionId: string;
  message: WishAssistantMessage;
  suggestedWishDraft?: {
    text: string;
    category: WishCategory;
    importance: number;
    structuredHints?: WishStructuredHints;
  };
}
