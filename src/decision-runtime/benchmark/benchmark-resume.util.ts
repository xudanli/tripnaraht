/**
 * Resume stage resolution — never reset to PENDING on transient failure.
 */

import type {
  BenchmarkInstanceExecutionStatus,
  BenchmarkResumeStage,
} from './benchmark-run.types';

const TERMINAL: BenchmarkInstanceExecutionStatus[] = [
  'COMPLETED',
  'EXCLUDED',
  'TERMINAL_FAILED',
];

export function isTerminalInstanceStatus(status: BenchmarkInstanceExecutionStatus): boolean {
  return TERMINAL.includes(status);
}

export function isClaimableStatus(
  status: BenchmarkInstanceExecutionStatus,
  leaseExpiresAt?: Date | string | null,
  now = Date.now(),
): boolean {
  if (status === 'PENDING' || status === 'RETRYABLE_FAILED') return true;
  if (status === 'RUNNING') {
    if (!leaseExpiresAt) return true;
    const exp =
      leaseExpiresAt instanceof Date
        ? leaseExpiresAt.getTime()
        : new Date(leaseExpiresAt).getTime();
    return exp < now;
  }
  return false;
}

/** Maps persisted status → next resume action (no Authority re-submit unless PENDING). */
export function resolveResumeStage(
  status: BenchmarkInstanceExecutionStatus,
): BenchmarkResumeStage {
  switch (status) {
    case 'PENDING':
    case 'RETRYABLE_FAILED':
      return 'SUBMIT_AUTHORITY';
    case 'RUNNING':
      return 'SUBMIT_AUTHORITY';
    case 'AUTHORITY_COMPLETED':
      return 'WAIT_SHADOW';
    case 'SHADOW_COMPLETED':
      return 'MATERIALIZE';
    case 'REVIEW_MATERIALIZED':
      return 'FINALIZE';
    case 'COMPLETED':
    case 'EXCLUDED':
    case 'TERMINAL_FAILED':
      return 'SKIP_TERMINAL';
    default:
      return 'SKIP_TERMINAL';
  }
}

/** After RUNNING claim, refine action based on persisted artifacts. */
export function resolveResumeStageWithArtifacts(input: {
  status: BenchmarkInstanceExecutionStatus;
  hasAuthorityResponse: boolean;
  hasShadowEvent: boolean;
  hasReviewCase: boolean;
}): BenchmarkResumeStage {
  if (isTerminalInstanceStatus(input.status)) return 'SKIP_TERMINAL';

  if (input.hasReviewCase || input.status === 'REVIEW_MATERIALIZED') {
    return 'FINALIZE';
  }
  if (input.hasShadowEvent || input.status === 'SHADOW_COMPLETED') {
    return 'MATERIALIZE';
  }
  if (input.hasAuthorityResponse || input.status === 'AUTHORITY_COMPLETED') {
    return 'WAIT_SHADOW';
  }
  if (
    input.status === 'PENDING' ||
    input.status === 'RETRYABLE_FAILED' ||
    input.status === 'RUNNING'
  ) {
    return 'SUBMIT_AUTHORITY';
  }
  return resolveResumeStage(input.status);
}

export function shouldReSubmitAuthority(
  stage: BenchmarkResumeStage,
  hasAuthorityResponse: boolean,
): boolean {
  return stage === 'SUBMIT_AUTHORITY' && !hasAuthorityResponse;
}
