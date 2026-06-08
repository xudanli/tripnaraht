export type InternalRiskLevel = 'none' | 'low' | 'high';

export interface UserReputationAssets {
  userId: string;
  averageStars: number | null;
  surveyCount: number;
  tagCloud: string[];
  safetyWarning: string | null;
  internalRiskLevel: InternalRiskLevel;
  updatedAt: string | null;
}

export interface PendingSurveyCompanion {
  userId: string;
  displayName: string;
  cardTitle: string | null;
  alreadyRated: boolean;
}

export interface PendingSurveyCampaignView {
  id: string;
  postId: string;
  destinationLabel: string | null;
  tripEndDate: string;
  pushCopy: {
    title: string;
    modalPriority: 'global_top';
  };
  companionsToRate: PendingSurveyCompanion[];
  isComplete: boolean;
}

export interface ReputationSurveySubmitResult {
  submissionId: string;
  campaignId: string;
  revieweeUserId: string;
  campaignComplete: boolean;
  revieweeReputation: UserReputationAssets;
}
