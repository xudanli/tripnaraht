/**
 * Server-side classification from blind preferredOption + private mapping.
 * Reviewers must NOT submit classification — prevents strategy leakage.
 */

import type { ManualReviewVerdict } from './shadow-divergence.types';
import type { BlindMappingPayload } from './shadow-blind-mapping-crypto.util';

export type ReviewPreferredOption =
  | 'A'
  | 'B'
  | 'EQUIVALENT'
  | 'BOTH_INVALID'
  | 'INSUFFICIENT_INFORMATION';

export function deriveReviewClassification(input: {
  preferredOption: ReviewPreferredOption;
  blindMapping: BlindMappingPayload;
}): ManualReviewVerdict {
  const { preferredOption, blindMapping } = input;

  if (preferredOption === 'EQUIVALENT') return 'EQUIVALENT';
  if (preferredOption === 'BOTH_INVALID') return 'BOTH_INVALID';
  if (preferredOption === 'INSUFFICIENT_INFORMATION') {
    return 'INSUFFICIENT_INFORMATION';
  }

  const selectedRole =
    preferredOption === 'A' ? blindMapping.optionAIs : blindMapping.optionBIs;

  // AUTHORITY = Legacy finalize selector; SHADOW = cp-sat-lex lex selector
  return selectedRole === 'SHADOW' ? 'LEX_BETTER' : 'LEGACY_BETTER';
}
