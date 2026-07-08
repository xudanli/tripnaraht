import {
  classifyHttpFailure,
  resolveInstanceStatusAfterFailure,
  backoffForAttempt,
} from './benchmark-failure.util';

describe('benchmark-failure.util', () => {
  it('classifies auth errors as abort-run terminal', () => {
    const c = classifyHttpFailure({ httpStatus: 401, message: 'Unauthorized', stage: 'AUTHORITY' });
    expect(c.failureClass).toBe('AUTHENTICATION_ERROR');
    expect(c.abortRun).toBe(true);
    expect(resolveInstanceStatusAfterFailure(c, 1, 3)).toBe('TERMINAL_FAILED');
  });

  it('classifies 429 as retryable with backoff', () => {
    const c = classifyHttpFailure({ httpStatus: 429, message: 'Too many', stage: 'AUTHORITY' });
    expect(c.retryable).toBe(true);
    expect(c.backoffMs).toBeGreaterThan(0);
    expect(resolveInstanceStatusAfterFailure(c, 1, 3)).toBe('RETRYABLE_FAILED');
  });

  it('marks shadow timeout retryable until max attempts', () => {
    const c = classifyHttpFailure({
      message: 'Shadow event wait timeout',
      stage: 'WAIT_SHADOW',
    });
    expect(c.failureClass).toBe('SHADOW_TIMEOUT');
    expect(resolveInstanceStatusAfterFailure(c, 2, 3)).toBe('RETRYABLE_FAILED');
    expect(resolveInstanceStatusAfterFailure(c, 3, 3)).toBe('TERMINAL_FAILED');
  });

  it('excludes INPUT_MISMATCH', () => {
    const c = classifyHttpFailure({ message: 'INPUT_MISMATCH detected', stage: 'MATERIALIZE' });
    expect(resolveInstanceStatusAfterFailure(c, 1, 3)).toBe('EXCLUDED');
  });

  it('uses escalating backoff steps', () => {
    expect(backoffForAttempt(1, 2000)).toBe(2000);
    expect(backoffForAttempt(2, 2000)).toBe(5000);
    expect(backoffForAttempt(5, 2000)).toBe(15000);
  });
});
