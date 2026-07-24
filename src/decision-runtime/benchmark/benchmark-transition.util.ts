/**
 * Benchmark instance status transition guard — forward-only staged progression.
 */

import type { BenchmarkInstanceExecutionStatus } from './benchmark-run.types';

export class BenchmarkTransitionError extends Error {
  constructor(
    public readonly from: BenchmarkInstanceExecutionStatus,
    public readonly to: BenchmarkInstanceExecutionStatus,
  ) {
    super(`Illegal benchmark transition: ${from} → ${to}`);
    this.name = 'BenchmarkTransitionError';
  }
}

const TERMINAL: BenchmarkInstanceExecutionStatus[] = [
  'COMPLETED',
  'EXCLUDED',
  'TERMINAL_FAILED',
];

/** Allowed forward transitions (excluding self/no-op). */
const ALLOWED: Record<BenchmarkInstanceExecutionStatus, BenchmarkInstanceExecutionStatus[]> = {
  PENDING: ['RUNNING', 'TERMINAL_FAILED', 'EXCLUDED'],
  RUNNING: [
    'AUTHORITY_COMPLETED',
    'SHADOW_COMPLETED',
    'REVIEW_MATERIALIZED',
    'COMPLETED',
    'EXCLUDED',
    'RETRYABLE_FAILED',
    'TERMINAL_FAILED',
  ],
  AUTHORITY_COMPLETED: [
    'SHADOW_COMPLETED',
    'EXCLUDED',
    'RETRYABLE_FAILED',
    'TERMINAL_FAILED',
  ],
  SHADOW_COMPLETED: [
    'REVIEW_MATERIALIZED',
    'EXCLUDED',
    'RETRYABLE_FAILED',
    'TERMINAL_FAILED',
    'COMPLETED',
  ],
  REVIEW_MATERIALIZED: ['COMPLETED', 'TERMINAL_FAILED'],
  RETRYABLE_FAILED: ['RUNNING', 'TERMINAL_FAILED', 'EXCLUDED'],
  COMPLETED: [],
  EXCLUDED: [],
  TERMINAL_FAILED: [],
};

export function isAllowedBenchmarkTransition(
  from: BenchmarkInstanceExecutionStatus,
  to: BenchmarkInstanceExecutionStatus,
): boolean {
  if (from === to) return true;
  if (TERMINAL.includes(from)) return false;
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertBenchmarkTransition(
  from: BenchmarkInstanceExecutionStatus,
  to: BenchmarkInstanceExecutionStatus | undefined,
): void {
  if (!to || to === from) return;
  if (!isAllowedBenchmarkTransition(from, to)) {
    throw new BenchmarkTransitionError(from, to);
  }
}
