/**
 * ONT-P2-04 — Limited display-variant A/B on the same Prediction payload.
 * Stable binding: userId → variant (never per-request random).
 * Presentation order / emphasis only — prediction fields unchanged.
 */

import { createHash } from 'crypto';
import type { UserTemporalAdvisory } from './user-advisory.types';
import { COHORT_EXPANSION_USER_IDS } from './cohort-expansion.cohort';

export const COHORT_DISPLAY_VARIANT_IDS = [
  'SECTIONS_DEFAULT',
  'DEADLINE_EMPHASIS',
] as const;

export type CohortDisplayVariantId = (typeof COHORT_DISPLAY_VARIANT_IDS)[number];

export type DisplaySectionKey = keyof UserTemporalAdvisory['display'];

export const DEFAULT_SECTION_ORDER: readonly DisplaySectionKey[] = [
  'whatPredicted',
  'whyRelevant',
  'latestActionBy',
  'recommendation',
  'currentStatus',
] as const;

/** Emphasize risk timing / latest action / segment relevance — same copy. */
export const DEADLINE_FIRST_SECTION_ORDER: readonly DisplaySectionKey[] = [
  'latestActionBy',
  'whatPredicted',
  'whyRelevant',
  'recommendation',
  'currentStatus',
] as const;

export const DISPLAY_EXPERIMENT_ID =
  'p2-cohort-display-variant@v1' as const;
export const DISPLAY_ASSIGNMENT_VERSION = 'assign@v1' as const;

export interface CohortDisplayVariantProjection {
  variantId: CohortDisplayVariantId;
  sectionOrder: DisplaySectionKey[];
  sections: UserTemporalAdvisory['display'];
  predictionId: string;
  predictionVersion: string;
  /** Prediction parity fields — must equal source advisory */
  predictionParity: {
    expectedOutcome: UserTemporalAdvisory['expectedOutcome'];
    confidence: number;
    interventionDeadline?: string;
    authorityMode: 'SHADOW';
    p1CanonicalPriority: true;
  };
  notes: string[];
}

export interface FrozenDisplayExperimentAssignment {
  schemaId: 'tripnara.ontology_p2_cohort_display_experiment@v1';
  experimentId: typeof DISPLAY_EXPERIMENT_ID;
  assignmentVersion: typeof DISPLAY_ASSIGNMENT_VERSION;
  assignmentHash: string;
  predictionParity: true;
  frozenAt: string;
  /** Stable userId → variant (no per-request flip). */
  assignments: Array<{ userId: string; variantId: CohortDisplayVariantId }>;
  counts: { SECTIONS_DEFAULT: number; DEADLINE_EMPHASIS: number };
  stopVariantIf: {
    canonical_vs_advisory_confusion_gt: 0;
    user_believed_plan_auto_changed_gt: 0;
    too_alarming_elevated: true;
    user_missed_canonical_block_gt: 0;
  };
  mustNotChange: Array<
    | 'expectedOutcome'
    | 'confidence'
    | 'interventionDeadline'
    | 'authority'
    | 'P1_Canonical_priority'
  >;
}

/** Stable 50/50 by userId only — same user never flips across requests. */
export function assignDisplayVariantForUser(userId: string): CohortDisplayVariantId {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return h % 2 === 0 ? 'SECTIONS_DEFAULT' : 'DEADLINE_EMPHASIS';
}

/** @deprecated use assignDisplayVariantForUser — kept for call-site compat */
export function assignDisplayVariant(input: {
  userId: string;
  tripId?: string;
  predictionId?: string;
}): CohortDisplayVariantId {
  void input.tripId;
  void input.predictionId;
  return assignDisplayVariantForUser(input.userId);
}

export function freezeDisplayExperimentAssignment(input?: {
  userIds?: readonly string[];
  nowMs?: number;
}): FrozenDisplayExperimentAssignment {
  const userIds = input?.userIds ?? COHORT_EXPANSION_USER_IDS;
  const frozenAt = new Date(input?.nowMs ?? Date.now()).toISOString();
  const assignments = [...userIds].map((userId) => ({
    userId,
    variantId: assignDisplayVariantForUser(userId),
  }));
  const counts = { SECTIONS_DEFAULT: 0, DEADLINE_EMPHASIS: 0 };
  for (const a of assignments) counts[a.variantId] += 1;

  const assignmentHash = `xh_${createHash('sha256')
    .update(
      JSON.stringify({
        experimentId: DISPLAY_EXPERIMENT_ID,
        assignmentVersion: DISPLAY_ASSIGNMENT_VERSION,
        assignments,
      }),
    )
    .digest('hex')
    .slice(0, 24)}`;

  return {
    schemaId: 'tripnara.ontology_p2_cohort_display_experiment@v1',
    experimentId: DISPLAY_EXPERIMENT_ID,
    assignmentVersion: DISPLAY_ASSIGNMENT_VERSION,
    assignmentHash,
    predictionParity: true,
    frozenAt,
    assignments,
    counts,
    stopVariantIf: {
      canonical_vs_advisory_confusion_gt: 0,
      user_believed_plan_auto_changed_gt: 0,
      too_alarming_elevated: true,
      user_missed_canonical_block_gt: 0,
    },
    mustNotChange: [
      'expectedOutcome',
      'confidence',
      'interventionDeadline',
      'authority',
      'P1_Canonical_priority',
    ],
  };
}

export function projectCohortDisplayVariant(input: {
  advisory: UserTemporalAdvisory;
  variantId?: CohortDisplayVariantId;
}): CohortDisplayVariantProjection {
  const variantId =
    input.variantId ?? assignDisplayVariantForUser(input.advisory.userId);

  const sectionOrder = [
    ...(variantId === 'DEADLINE_EMPHASIS'
      ? DEADLINE_FIRST_SECTION_ORDER
      : DEFAULT_SECTION_ORDER),
  ];

  return {
    variantId,
    sectionOrder,
    sections: { ...input.advisory.display },
    predictionId: input.advisory.predictionId,
    predictionVersion: input.advisory.predictionVersion,
    predictionParity: {
      expectedOutcome: input.advisory.expectedOutcome,
      confidence: input.advisory.confidence,
      interventionDeadline: input.advisory.interventionDeadline,
      authorityMode: 'SHADOW',
      p1CanonicalPriority: true,
    },
    notes: [
      'Display variant changes section order / emphasis only',
      'Stable binding: userId → variant',
      'expectedOutcome / confidence / interventionDeadline / authority unchanged',
    ],
  };
}

export function compareDisplayVariantsForSamePrediction(
  advisory: UserTemporalAdvisory,
): {
  predictionId: string;
  predictionVersion: string;
  variants: CohortDisplayVariantProjection[];
  sameCopy: boolean;
  predictionParity: boolean;
} {
  const a = projectCohortDisplayVariant({
    advisory,
    variantId: 'SECTIONS_DEFAULT',
  });
  const b = projectCohortDisplayVariant({
    advisory,
    variantId: 'DEADLINE_EMPHASIS',
  });
  const sameCopy =
    JSON.stringify(a.sections) === JSON.stringify(b.sections) &&
    a.predictionId === b.predictionId &&
    a.predictionVersion === b.predictionVersion;
  const predictionParity =
    JSON.stringify(a.predictionParity) === JSON.stringify(b.predictionParity);

  return {
    predictionId: advisory.predictionId,
    predictionVersion: advisory.predictionVersion,
    variants: [a, b],
    sameCopy,
    predictionParity,
  };
}

export function evaluateDisplayVariantStop(input: {
  canonical_vs_advisory_confusion: number;
  user_believed_plan_auto_changed: number;
  too_alarming_rate_delta: number;
  user_missed_canonical_block: number;
}): { stop: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.canonical_vs_advisory_confusion > 0) {
    reasons.push('canonical_vs_advisory_confusion');
  }
  if (input.user_believed_plan_auto_changed > 0) {
    reasons.push('user_believed_plan_auto_changed');
  }
  if (input.too_alarming_rate_delta > 0.1) {
    reasons.push('too_alarming_elevated');
  }
  if (input.user_missed_canonical_block > 0) {
    reasons.push('user_missed_canonical_block');
  }
  return { stop: reasons.length > 0, reasons };
}
