/**
 * ONT-P2-02B — dual feedback (prediction quality ≠ product usefulness)
 */

import { createHash } from 'crypto';
import type {
  InternalAdvisoryFeedback,
  ProductAdviceFeedback,
  PredictionQualityFeedback,
} from './advisory.types';
import type { InternalTemporalAdvisory } from './advisory.types';
import type { InternalTemporalAdvisoryAuthorizationV2 } from './authorization';
import { canViewerSeeInternalAdvisory } from './advisory.emitter';

export function recordInternalAdvisoryFeedback(input: {
  authorization: InternalTemporalAdvisoryAuthorizationV2;
  advisory: InternalTemporalAdvisory;
  reviewerId: string;
  predictionQuality: PredictionQualityFeedback;
  productAdvice: ProductAdviceFeedback;
  notes?: string;
  nowMs?: number;
}): InternalAdvisoryFeedback | { skipped: string } {
  if (!canViewerSeeInternalAdvisory(input.reviewerId, input.authorization)) {
    return { skipped: 'viewer_not_approved' };
  }
  const reviewedAt = new Date(input.nowMs ?? Date.now()).toISOString();
  return {
    schemaId: 'tripnara.internal_advisory_feedback@v1',
    feedbackId: `fb_${createHash('sha256')
      .update(
        `${input.advisory.advisoryId}|${input.reviewerId}|${reviewedAt}`,
      )
      .digest('hex')
      .slice(0, 16)}`,
    advisoryId: input.advisory.advisoryId,
    predictionId: input.advisory.predictionId,
    predictionVersion: input.advisory.predictionVersion,
    contextRevision: input.advisory.contextRevision,
    reviewerId: input.reviewerId,
    reviewedAt,
    predictionQuality: input.predictionQuality,
    productAdvice: input.productAdvice,
    notes: input.notes,
  };
}
