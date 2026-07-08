import {
  assertBenchmarkTransition,
  BenchmarkTransitionError,
  isAllowedBenchmarkTransition,
} from './benchmark-transition.util';

describe('benchmark-transition.util', () => {
  it('allows staged forward progression', () => {
    expect(isAllowedBenchmarkTransition('PENDING', 'RUNNING')).toBe(true);
    expect(isAllowedBenchmarkTransition('RUNNING', 'AUTHORITY_COMPLETED')).toBe(true);
    expect(isAllowedBenchmarkTransition('AUTHORITY_COMPLETED', 'SHADOW_COMPLETED')).toBe(true);
    expect(isAllowedBenchmarkTransition('SHADOW_COMPLETED', 'REVIEW_MATERIALIZED')).toBe(true);
    expect(isAllowedBenchmarkTransition('REVIEW_MATERIALIZED', 'COMPLETED')).toBe(true);
  });

  it('blocks illegal backward transitions', () => {
    expect(isAllowedBenchmarkTransition('SHADOW_COMPLETED', 'PENDING')).toBe(false);
    expect(isAllowedBenchmarkTransition('COMPLETED', 'RUNNING')).toBe(false);
    expect(isAllowedBenchmarkTransition('REVIEW_MATERIALIZED', 'AUTHORITY_COMPLETED')).toBe(false);
  });

  it('throws on illegal transition', () => {
    expect(() => assertBenchmarkTransition('COMPLETED', 'RUNNING')).toThrow(
      BenchmarkTransitionError,
    );
  });

  it('allows no-op and undefined target', () => {
    expect(() => assertBenchmarkTransition('RUNNING', 'RUNNING')).not.toThrow();
    expect(() => assertBenchmarkTransition('RUNNING', undefined)).not.toThrow();
  });
});
