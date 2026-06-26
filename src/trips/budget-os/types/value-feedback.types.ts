import type { SpendingPersona } from './trip-budget-os.types';

export type ValueFeedbackSourceType = 'itinerary_item' | 'manual';

export interface ValueFeedback {
  id: string;
  tripId: string;
  sourceType: ValueFeedbackSourceType;
  sourceId: string;
  amount: number;
  category: string;
  satisfaction: 1 | 2 | 3 | 4 | 5;
  note?: string;
  createdBy: string;
  createdAt: string;
}

export interface SubmitValueFeedbackInput {
  sourceType: ValueFeedbackSourceType;
  sourceId: string;
  satisfaction: 1 | 2 | 3 | 4 | 5;
  note?: string;
}

export interface CategoryValueSummary {
  avgSatisfaction: number;
  avgAmount: number;
  valueScore: number;
  feedbackCount: number;
}

export interface TripValueSummary {
  byCategory: Record<string, CategoryValueSummary>;
  overallValueScore: number;
}

export interface MoneyDnaProfile {
  userId: string;
  experienceSensitivity: number;
  accommodationSensitivity: number;
  efficiencySensitivity: number;
  frugalityIndex: number;
  dominantPersona: SpendingPersona;
  tripCount: number;
  lastUpdatedAt: string;
  confidence: number;
  /** L2-05: recommended percent allocation from historical value feedback */
  defaultStructure?: {
    mode: 'percent';
    percentages: import('./trip-budget-os.types').CategoryPercentages;
    spendingPersona: SpendingPersona;
    source: 'money_dna' | 'canonical';
  };
}

export interface ValueFeedbackRow {
  tripId: string;
  sourceType: string;
  sourceId: string;
  amount: number;
  category: string;
  satisfaction: number;
  createdBy: string;
}
