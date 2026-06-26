/** M11 Experience Loop types */

import type { ExperienceFulfillmentReview } from '../../experience-fulfillment/types/experience-outcome.types';
import type { ExperienceTagMatchOption } from '../../experience-fulfillment/types/experience-outcome.types';

export type ExperienceTriggerType =
  | 'post_activity'
  | 'post_decision'
  | 'daily_review'
  | 'split_party'
  | 'last_day';

export interface ExperiencePulseTrigger {
  triggerType: ExperienceTriggerType;
  triggerKey: string;
  title: string;
  prompt: string;
  activityName?: string;
  priority: number;
}

export interface SubmitExperiencePulseInput {
  triggerType: ExperienceTriggerType;
  triggerKey?: string;
  activityName?: string;
  expectationConfirmation?: number;
  emotionalValueScore?: number;
  senseOfControl?: number;
  spendWorthIt?: number;
  teamAtmosphere?: number;
  freeText?: string;
  /** PRD §14.3 实际感受更接近哪一种 */
  experienceTagMatch?: ExperienceTagMatchOption;
}

export interface ExperiencePulseSummary {
  id: string;
  tripId: string;
  memberId: string;
  triggerType: ExperienceTriggerType;
  activityName: string | null;
  expectationConfirmation: number | null;
  emotionalValueScore: number | null;
  senseOfControl: number | null;
  spendWorthIt: number | null;
  teamAtmosphere: number | null;
  freeText: string | null;
  emotionPolarity: number | null;
  submittedAt: string;
}

export interface RecommendationWeightPatch {
  activityIntensityDelta: number;
  diningQualityDelta: number;
  museumDensityDelta: number;
  bufferDayInserted?: boolean;
  explanationZh: string;
  appliedAt: string;
}

export interface WeightAdjustmentNotice {
  appliedAt: string;
  patch: RecommendationWeightPatch;
  unread: boolean;
}

export interface PostTripHighlight {
  activityName: string;
  emotionalValueScore: number;
  memberId: string;
  quote?: string;
}

export interface PostTripSpendingReview {
  totalSpentCny: number;
  budgetTotal: number | null;
  usagePercent: number | null;
  topCategory: string | null;
  currency: string;
}

export interface PostTripTeamReview {
  averageScore: number;
  levelTrend: Array<{ dayNumber: number; level: string; score: number }>;
}

export interface PostTripProfileCalibration {
  userId: string;
  calibrated: boolean;
  dominantPersona?: string;
  note: string;
}

export interface PostTripSummary {
  tripId: string;
  generatedAt: string;
  experienceHighlights: PostTripHighlight[];
  spendingReview: PostTripSpendingReview;
  teamReview: PostTripTeamReview;
  profileCalibrations: PostTripProfileCalibration[];
  /** 规划期体验意图 vs 行中反馈对齐（PRD §14） */
  experienceFulfillmentReview?: ExperienceFulfillmentReview;
}

export interface InTripMetadataExtension {
  inTripRecommendationWeights?: RecommendationWeightPatch;
  inTripWeightAdjustmentHistory?: WeightAdjustmentNotice[];
  postTripSummary?: PostTripSummary;
}
