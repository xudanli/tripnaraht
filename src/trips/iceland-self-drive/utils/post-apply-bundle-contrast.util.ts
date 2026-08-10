/**
 * Diff Shadow Confirm gate vs post-Apply UnifiedConstraintAssessment bundle.
 */

import type { UnifiedConstraintAssessmentBundle } from '../../../decision-runtime/constraints/contracts/unified-constraint-assessment.types';
import type { UnifiedAssessmentAggregateStatus } from '../../../decision-runtime/constraints/contracts/unified-constraint-assessment.types';

const BLOCKING: Set<UnifiedAssessmentAggregateStatus> = new Set([
  'PLANNING_BLOCK',
  'EXECUTION_BLOCK',
  'RUNTIME_BLOCK',
]);

const RANK: Record<UnifiedAssessmentAggregateStatus, number> = {
  PASS: 0,
  WARN: 1,
  UNKNOWN: 2,
  PLANNING_BLOCK: 3,
  EXECUTION_BLOCK: 4,
  RUNTIME_BLOCK: 5,
};

export interface PostApplyBundleContrast {
  schemaId: 'tripnara.iceland_post_apply_bundle_contrast@v1';
  prismaTripId: string;
  proposalId: string;
  /** Shadow VERIFY allowConfirm at proposal time (pre-Apply). */
  shadowAllowConfirmAtVerify: boolean;
  bundle: {
    itemCount: number;
    worstAggregateStatus: UnifiedAssessmentAggregateStatus | 'EMPTY';
    blockingKeys: string[];
    /** No PLANNING/EXECUTION/RUNTIME_BLOCK → confirm-shaped ok. */
    allowConfirmProjection: boolean;
  };
  /** shadowAllowConfirmAtVerify === bundle.allowConfirmProjection */
  gateAlignedWithShadow: boolean;
  doesNotAffectCapabilities: true;
  notes: string[];
  error?: string;
}

export function contrastPostApplyBundle(input: {
  prismaTripId: string;
  proposalId: string;
  shadowAllowConfirmAtVerify: boolean;
  bundle?: UnifiedConstraintAssessmentBundle;
  error?: string;
}): PostApplyBundleContrast {
  const notes: string[] = [
    'Post-Apply secondary contrast via UnifiedConstraintAssessmentService.buildBundle.',
    'Does not change Confirm/Apply authority (already applied).',
  ];

  if (input.error || !input.bundle) {
    notes.push(
      input.error
        ? `buildBundle failed: ${input.error}`
        : 'buildBundle returned no bundle',
    );
    return {
      schemaId: 'tripnara.iceland_post_apply_bundle_contrast@v1',
      prismaTripId: input.prismaTripId,
      proposalId: input.proposalId,
      shadowAllowConfirmAtVerify: input.shadowAllowConfirmAtVerify,
      bundle: {
        itemCount: 0,
        worstAggregateStatus: 'EMPTY',
        blockingKeys: [],
        allowConfirmProjection: true,
      },
      gateAlignedWithShadow: input.shadowAllowConfirmAtVerify === true,
      doesNotAffectCapabilities: true,
      notes,
      error: input.error ?? 'BUNDLE_MISSING',
    };
  }

  const blockingKeys = input.bundle.items
    .filter((i) => BLOCKING.has(i.aggregateStatus))
    .map((i) => i.constraintKey);

  let worst: UnifiedAssessmentAggregateStatus | 'EMPTY' = 'EMPTY';
  for (const item of input.bundle.items) {
    if (worst === 'EMPTY' || RANK[item.aggregateStatus] > RANK[worst]) {
      worst = item.aggregateStatus;
    }
  }
  if (input.bundle.items.length === 0) {
    worst = 'EMPTY';
  }

  const allowConfirmProjection = blockingKeys.length === 0;
  const gateAlignedWithShadow =
    input.shadowAllowConfirmAtVerify === allowConfirmProjection;

  if (!gateAlignedWithShadow) {
    notes.push(
      `Gate drift post-Apply: shadowAllowConfirm=${input.shadowAllowConfirmAtVerify} bundle.allowConfirmProjection=${allowConfirmProjection}`,
    );
  }
  if (blockingKeys.length) {
    notes.push(`Bundle blocking keys: ${blockingKeys.join(', ')}`);
  }

  return {
    schemaId: 'tripnara.iceland_post_apply_bundle_contrast@v1',
    prismaTripId: input.prismaTripId,
    proposalId: input.proposalId,
    shadowAllowConfirmAtVerify: input.shadowAllowConfirmAtVerify,
    bundle: {
      itemCount: input.bundle.meta.itemCount ?? input.bundle.items.length,
      worstAggregateStatus: worst,
      blockingKeys,
      allowConfirmProjection,
    },
    gateAlignedWithShadow,
    doesNotAffectCapabilities: true,
    notes,
  };
}
