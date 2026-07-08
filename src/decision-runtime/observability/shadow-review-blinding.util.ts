/**
 * Stable blind A/B assignment — bound to comparisonId + blindingVersion + salt.
 */

import { createHash } from 'crypto';
import {
  SHADOW_BLINDING_VERSION,
  resolveBlindingSalt,
} from './shadow-evidence-persistence.config';
import type { FrozenReviewPlanSnapshot } from './shadow-review.types';
import type { ReviewPlanSnapshot } from './shadow-review.types';

export interface BlindAssignment {
  blindedOptionA: ReviewPlanSnapshot;
  blindedOptionB: ReviewPlanSnapshot;
  blindMapping: {
    optionAIs: 'AUTHORITY' | 'SHADOW';
    optionBIs: 'AUTHORITY' | 'SHADOW';
  };
  blindingVersion: string;
}

export function assignBlindOptions(input: {
  comparisonId: string;
  authoritySnapshot: FrozenReviewPlanSnapshot;
  shadowSnapshot: FrozenReviewPlanSnapshot;
}): BlindAssignment {
  const swap = shouldSwapBlindPosition(input.comparisonId);
  const authorityPublic = toPublicSnapshot(input.authoritySnapshot);
  const shadowPublic = toPublicSnapshot(input.shadowSnapshot);

  if (swap) {
    return {
      blindedOptionA: shadowPublic,
      blindedOptionB: authorityPublic,
      blindMapping: { optionAIs: 'SHADOW', optionBIs: 'AUTHORITY' },
      blindingVersion: SHADOW_BLINDING_VERSION,
    };
  }
  return {
    blindedOptionA: authorityPublic,
    blindedOptionB: shadowPublic,
    blindMapping: { optionAIs: 'AUTHORITY', optionBIs: 'SHADOW' },
    blindingVersion: SHADOW_BLINDING_VERSION,
  };
}

export function shouldSwapBlindPosition(comparisonId: string): boolean {
  const salt = resolveBlindingSalt();
  const hex = createHash('sha256')
    .update(`${comparisonId}:${SHADOW_BLINDING_VERSION}:${salt}`)
    .digest('hex');
  return parseInt(hex.slice(0, 8), 16) % 2 === 1;
}

function toPublicSnapshot(frozen: FrozenReviewPlanSnapshot): ReviewPlanSnapshot {
  const {
    candidateId: _c,
    candidateHash: _h,
    planJson: _p,
    constraintSummaryJson: _cs,
    objectiveScoresJson: _o,
    snapshotId: _s,
    objectiveVersion: _ov,
    strategyVersionHidden: _sv,
    createdAt: _ca,
    ...publicView
  } = frozen;
  return publicView;
}
