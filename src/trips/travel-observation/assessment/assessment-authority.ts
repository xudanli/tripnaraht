/**
 * RealityOS PRD §10.4 — AssessmentAuthority
 * Single vision model must not alone form high-risk “allowed to continue”.
 */

import type {
  AssessmentAuthority,
  AssessmentStatus,
  VerificationStatus,
} from '../observation.types';
import type { GroundingResult } from '../grounding/grounding.types';

export type { AssessmentAuthority };
export const ASSESSMENT_AUTHORITY_RANK: Record<AssessmentAuthority, number> = {
  VISUAL_ONLY: 1,
  CONTEXT_GROUNDED: 2,
  OFFICIAL_CORROBORATED: 3,
  USER_CONFIRMED: 4,
  PROFESSIONAL_CONFIRMED: 5,
};

/** High-impact statuses must not sit on VISUAL_ONLY alone */
export function minAuthorityForStatus(
  status: AssessmentStatus,
): AssessmentAuthority {
  if (status === 'EXECUTION_BLOCK' || status === 'SUGGEST_REPLACE') {
    return 'OFFICIAL_CORROBORATED';
  }
  if (status === 'NEED_CONFIRM') {
    return 'CONTEXT_GROUNDED';
  }
  return 'VISUAL_ONLY';
}

export function resolveAssessmentAuthority(input: {
  hasGps: boolean;
  verificationStatus: VerificationStatus;
  status: AssessmentStatus;
  grounding?: GroundingResult;
  userConfirmed?: boolean;
}): AssessmentAuthority {
  if (input.userConfirmed) return 'USER_CONFIRMED';

  const official =
    input.grounding?.officialRoadOpen !== undefined ||
    !!input.grounding?.roadStatusUpdatedAt ||
    (input.verificationStatus === 'VERIFIED' &&
      input.grounding?.vehicleRoadFit === 'MISMATCH');

  if (!input.hasGps || input.verificationStatus === 'INSUFFICIENT') {
    return 'VISUAL_ONLY';
  }

  if (input.verificationStatus === 'CONFLICTING') {
    return 'CONTEXT_GROUNDED';
  }

  if (
    official &&
    (input.status === 'EXECUTION_BLOCK' ||
      input.status === 'SUGGEST_REPLACE' ||
      input.status === 'NEED_CONFIRM')
  ) {
    return 'OFFICIAL_CORROBORATED';
  }

  if (official && input.verificationStatus === 'VERIFIED') {
    return 'OFFICIAL_CORROBORATED';
  }

  return 'CONTEXT_GROUNDED';
}

/**
 * Downgrade status when authority is too weak for the claimed impact.
 * Never invent APPLY; only softens road BLOCK / REPLACE.
 */
export function enforceAuthorityGate(input: {
  status: AssessmentStatus;
  authority: AssessmentAuthority;
}): { status: AssessmentStatus; authority: AssessmentAuthority } {
  const min = minAuthorityForStatus(input.status);
  if (
    ASSESSMENT_AUTHORITY_RANK[input.authority] >=
    ASSESSMENT_AUTHORITY_RANK[min]
  ) {
    return input;
  }
  // Too weak for BLOCK/REPLACE → NEED_CONFIRM or UNKNOWN
  if (
    input.status === 'EXECUTION_BLOCK' ||
    input.status === 'SUGGEST_REPLACE'
  ) {
    return { status: 'NEED_CONFIRM', authority: input.authority };
  }
  return input;
}
