/**
 * Benchmark failure classification + retry policy.
 */

import type { BenchmarkFailureClass } from './benchmark-run.types';

export interface ClassifiedFailure {
  failureClass: BenchmarkFailureClass;
  retryable: boolean;
  abortRun: boolean;
  backoffMs: number;
}

export function classifyHttpFailure(input: {
  httpStatus?: number;
  message: string;
  stage: string;
}): ClassifiedFailure {
  const { httpStatus, message, stage } = input;

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      failureClass: 'AUTHENTICATION_ERROR',
      retryable: false,
      abortRun: true,
      backoffMs: 0,
    };
  }
  if (httpStatus === 429) {
    return {
      failureClass: 'RATE_LIMITED',
      retryable: true,
      abortRun: false,
      backoffMs: 5000,
    };
  }
  if (httpStatus != null && httpStatus >= 500) {
    return {
      failureClass: 'SERVER_ERROR',
      retryable: true,
      abortRun: false,
      backoffMs: 2000,
    };
  }
  if (httpStatus === 400 || httpStatus === 422) {
    return {
      failureClass: 'INVALID_INSTANCE',
      retryable: false,
      abortRun: false,
      backoffMs: 0,
    };
  }
  if (/ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(message)) {
    return {
      failureClass: 'TRANSIENT_NETWORK',
      retryable: true,
      abortRun: false,
      backoffMs: 2000,
    };
  }
  if (stage === 'WAIT_SHADOW' && /timeout|timed out/i.test(message)) {
    return {
      failureClass: 'SHADOW_TIMEOUT',
      retryable: true,
      abortRun: false,
      backoffMs: 5000,
    };
  }
  if (/INPUT_MISMATCH/i.test(message)) {
    return {
      failureClass: 'INPUT_MISMATCH',
      retryable: false,
      abortRun: false,
      backoffMs: 0,
    };
  }
  if (/persist|prisma|database/i.test(message)) {
    return {
      failureClass: 'PERSISTENCE_ERROR',
      retryable: true,
      abortRun: false,
      backoffMs: 2000,
    };
  }
  if (/CONFIG_DRIFT|DATASET_DRIFT|objectiveRegistry/i.test(message)) {
    return {
      failureClass: 'CONFIGURATION_ERROR',
      retryable: false,
      abortRun: true,
      backoffMs: 0,
    };
  }
  return {
    failureClass: 'UNKNOWN',
    retryable: true,
    abortRun: false,
    backoffMs: 2000,
  };
}

export function backoffForAttempt(attemptCount: number, baseMs: number): number {
  const steps = [2000, 5000, 15000];
  if (attemptCount <= 1) return baseMs || steps[0];
  if (attemptCount === 2) return steps[1];
  return steps[2];
}

export function resolveInstanceStatusAfterFailure(
  classified: ClassifiedFailure,
  attemptCount: number,
  maxAttempts: number,
): 'RETRYABLE_FAILED' | 'TERMINAL_FAILED' | 'EXCLUDED' {
  if (classified.failureClass === 'INPUT_MISMATCH') return 'EXCLUDED';
  if (!classified.retryable || attemptCount >= maxAttempts) return 'TERMINAL_FAILED';
  return 'RETRYABLE_FAILED';
}
