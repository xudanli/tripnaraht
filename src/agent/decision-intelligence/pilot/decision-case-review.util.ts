/**
 * Decision Case Review — 人工复核 Disagreement / Poor / Inconclusive 高价值 Case。
 */

export const DECISION_CASE_REVIEW_SCHEMA =
  'nara.decision_case_review@v1' as const;

export type CaseReviewPriority =
  | 'DISAGREEMENT'
  | 'POOR'
  | 'INCONCLUSIVE'
  | 'OTHER';

export type CaseReviewRootCauseCategory =
  | 'STATE'
  | 'EVIDENCE'
  | 'DECISION'
  | 'OUTCOME'
  | 'ATTRIBUTION';

export type DecisionCaseReviewV1 = {
  schemaId: typeof DECISION_CASE_REVIEW_SCHEMA;
  version: 1;
  reviewId: string;
  recordId: string;
  decisionKey: string;
  tripId: string;
  priority: CaseReviewPriority;
  reviewer?: string;
  status: 'OPEN' | 'REVIEWED' | 'DISCARDED';
  notesZh?: string;
  reviewedAt?: string;
  /** Poor/Disagreement/Inconclusive 强制归因类别 */
  rootCauseCategory?: CaseReviewRootCauseCategory;
  /** 复核结论：是否可用于 Dataset / Temporal 建模 */
  usableForDataset?: boolean;
};

export function openDecisionCaseReview(input: {
  recordId: string;
  decisionKey: string;
  tripId: string;
  priority: CaseReviewPriority;
  reviewId?: string;
}): DecisionCaseReviewV1 {
  return {
    schemaId: DECISION_CASE_REVIEW_SCHEMA,
    version: 1,
    reviewId: input.reviewId ?? `review_${input.recordId}`,
    recordId: input.recordId,
    decisionKey: input.decisionKey,
    tripId: input.tripId,
    priority: input.priority,
    status: 'OPEN',
  };
}

export function completeDecisionCaseReview(
  review: DecisionCaseReviewV1,
  input: {
    reviewer: string;
    notesZh?: string;
    usableForDataset: boolean;
    discard?: boolean;
    /** Poor / Disagreement / Inconclusive 必须提供 */
    rootCauseCategory?: CaseReviewRootCauseCategory;
  },
): DecisionCaseReviewV1 {
  const highValue =
    review.priority === 'DISAGREEMENT' ||
    review.priority === 'POOR' ||
    review.priority === 'INCONCLUSIVE';
  if (highValue && !input.discard && !input.rootCauseCategory) {
    throw new Error(
      '[CaseReview] rootCauseCategory_required_for_high_value_case:STATE|EVIDENCE|DECISION|OUTCOME|ATTRIBUTION',
    );
  }
  return {
    ...review,
    reviewer: input.reviewer,
    notesZh: input.notesZh,
    usableForDataset: input.usableForDataset,
    rootCauseCategory: input.rootCauseCategory,
    status: input.discard ? 'DISCARDED' : 'REVIEWED',
    reviewedAt: new Date().toISOString(),
  };
}

export function computeCaseReviewCoverage(input: {
  highValueCaseIds: string[];
  reviews: DecisionCaseReviewV1[];
}): number {
  if (!input.highValueCaseIds.length) return 0;
  const reviewed = new Set(
    input.reviews
      .filter((r) => r.status === 'REVIEWED')
      .map((r) => r.recordId),
  );
  const hit = input.highValueCaseIds.filter((id) => reviewed.has(id)).length;
  return hit / input.highValueCaseIds.length;
}
