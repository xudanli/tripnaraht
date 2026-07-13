import type { PlanDiff } from '../../../generated/execution-risk-contracts';

export interface PreviewRecommendationCommand {
  tripId: string;
  riskId: string;
  recommendationId: string;
  requestedBy: string;
  idempotencyKey: string;
  expectedPlanVersionId?: string;
}

export interface ConfirmRecommendationCommand {
  tripId: string;
  riskId: string;
  recommendationId: string;
  confirmedBy: string;
  idempotencyKey: string;
  expectedPlanVersionId?: string;
}

export interface RecommendationApplyPreview {
  planDiff: PlanDiff;
  preview: string;
  requiresConfirmation: true;
}

export interface ConfirmedDecisionResult {
  newPlanVersionId: string;
  ledgerRef: string;
  effectivePlanVersionId?: string;
  planActivated?: boolean;
  itineraryMaterialized?: boolean;
}

/** Canonical write authority — ERC must not remain a second itinerary writer. */
export interface CanonicalRecommendationApplyPort {
  preview(command: PreviewRecommendationCommand): Promise<RecommendationApplyPreview>;
  confirm(command: ConfirmRecommendationCommand): Promise<ConfirmedDecisionResult>;
}
