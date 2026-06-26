/**
 * 日程展示层 — PRD §13.3（灵感层 + 可信事实层，禁止工程术语直出）
 */

import type { UserCertaintyLevel } from './experience-explanation.types';

export type LoadLevel = 'light' | 'moderate' | 'heavy';

export type ItemPresentationBadge =
  | 'VERIFIED'
  | 'WEATHER_SENSITIVE'
  | 'LOW_PHYSICAL'
  | 'HAS_ALTERNATIVE'
  | 'CORE_EXPERIENCE';

export interface InspirationLayer {
  placeName: string;
  poeticLine: string;
  experienceTags: string[];
}

export interface CredibleFacts {
  driveHint?: string;
  walkHint?: string;
  vehicleHint?: string;
  weatherHint?: string;
  openingHours?: string;
  visitDuration?: string;
}

export interface PresentedItineraryItem {
  placeId: number;
  slot: string;
  startTime: string;
  endTime: string;
  badges: ItemPresentationBadge[];
  inspiration: InspirationLayer;
  credible: CredibleFacts;
  certaintyLabel?: string;
}

export interface PresentedItineraryDay {
  day: number;
  date: string;
  theme: string;
  driveLoad: LoadLevel;
  walkLoad: LoadLevel;
  budgetHint?: string;
  coreExperience: string;
  certaintyLevel: UserCertaintyLevel;
  certaintyLabel: string;
  certaintySummary: string;
  items: PresentedItineraryItem[];
}

export interface ItineraryPresentationBundle {
  revision: 'v1';
  days: PresentedItineraryDay[];
  overallCertaintyLevel: UserCertaintyLevel;
  overallCertaintyLabel: string;
  overallSummary: string;
}

/** NL / 确认页 planner block */
export interface WhyRecommendedPlannerBlock {
  type: 'why_recommended';
  title: string;
  bullets: string[];
  overallLabel: string;
  overallSummary: string;
  dimensions: {
    routeFeasibility: string;
    experienceMatch: string;
    changingFactors: string[];
  };
}
