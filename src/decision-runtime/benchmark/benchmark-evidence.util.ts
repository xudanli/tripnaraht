/**
 * Evidence chain integrity — DB vs artifact consistency.
 */

import type { BenchmarkInstanceExecutionStatus } from './benchmark-run.types';

export type EvidenceGapCode =
  | 'EVIDENCE_INCOMPLETE_AUTHORITY'
  | 'EVIDENCE_INCOMPLETE_SHADOW'
  | 'EVIDENCE_INCOMPLETE_MATERIALIZE'
  | 'ARTIFACT_HASH_MISMATCH';

export interface EvidenceGap {
  code: EvidenceGapCode;
  message: string;
}

export function detectEvidenceGap(input: {
  status: BenchmarkInstanceExecutionStatus;
  authorityResponseHash?: string;
  hasAuthorityFile: boolean;
  comparisonId?: string;
  shadowEventHash?: string;
  hasShadowFile: boolean;
  reviewCaseId?: string;
  hasMaterializeFile: boolean;
}): EvidenceGap | undefined {
  const dbClaimsAuthority =
    input.authorityResponseHash != null ||
    input.status === 'AUTHORITY_COMPLETED' ||
    input.status === 'SHADOW_COMPLETED' ||
    input.status === 'REVIEW_MATERIALIZED' ||
    input.status === 'COMPLETED';

  if (dbClaimsAuthority && !input.hasAuthorityFile) {
    return {
      code: 'EVIDENCE_INCOMPLETE_AUTHORITY',
      message: 'DB records authority completion but authority-response.json is missing',
    };
  }

  const dbClaimsShadow =
    input.comparisonId != null ||
    input.shadowEventHash != null ||
    input.status === 'SHADOW_COMPLETED' ||
    input.status === 'REVIEW_MATERIALIZED' ||
    input.status === 'COMPLETED';

  if (dbClaimsShadow && !input.hasShadowFile) {
    return {
      code: 'EVIDENCE_INCOMPLETE_SHADOW',
      message: 'DB records shadow completion but shadow-event.json is missing',
    };
  }

  const dbClaimsMaterialize =
    input.reviewCaseId != null ||
    input.status === 'REVIEW_MATERIALIZED' ||
    (input.status === 'COMPLETED' && Boolean(input.reviewCaseId));

  if (dbClaimsMaterialize && !input.hasMaterializeFile && input.reviewCaseId) {
    return {
      code: 'EVIDENCE_INCOMPLETE_MATERIALIZE',
      message: 'DB records review case but materialize-result.json is missing',
    };
  }

  return undefined;
}

export function detectArtifactHashMismatch(input: {
  storedHash?: string;
  fileHash?: string;
  label: string;
}): EvidenceGap | undefined {
  if (!input.storedHash || !input.fileHash) return undefined;
  if (input.storedHash !== input.fileHash) {
    return {
      code: 'ARTIFACT_HASH_MISMATCH',
      message: `${input.label} hash mismatch: stored=${input.storedHash} file=${input.fileHash}`,
    };
  }
  return undefined;
}
