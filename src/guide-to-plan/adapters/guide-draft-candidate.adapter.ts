/**
 * Guide itinerary drafts → DecisionCandidate[] (no Legacy TripDecisionEngine).
 */

import type { GuidePlanVariant } from '../constants/guide-to-plan-status.constants';
import type { DecisionCandidate } from '../../decision-runtime/candidates/contracts/decision-candidate';
import type { GuideItineraryDraft } from '../services/guide-plan-builder.service';
import { guideDraftToTripPlan } from '../utils/guide-draft-to-trip-plan.util';

export interface GuideBuiltVariantInput {
  variant: GuidePlanVariant;
  itineraryDraft: GuideItineraryDraft;
  utilityHint?: number;
}

export function mapGuideVariantsToDecisionCandidates(input: {
  variants: GuideBuiltVariantInput[];
  sessionId: string;
  travelModeDefault?: 'drive' | 'walk';
}): DecisionCandidate[] {
  return input.variants.map((v) => ({
    candidateId: v.variant,
    label: variantLabel(v.variant),
    source: 'LEGACY_TRIP_PLANNING' as const,
    plan: guideDraftToTripPlan({
      draft: v.itineraryDraft,
      tripId: input.sessionId,
      travelModeDefault: input.travelModeDefault,
    }),
    utilityHint: v.utilityHint,
    createdAt: new Date().toISOString(),
  }));
}

function variantLabel(variant: GuidePlanVariant): string {
  const labels: Record<string, string> = {
    balanced: '平衡方案',
    faithful: '忠实攻略',
    comfortable: '舒适方案',
    risk_min: '低风险方案',
    photography: '摄影方案',
  };
  return labels[variant] ?? variant;
}
