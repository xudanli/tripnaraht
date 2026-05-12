import {
  validateRouteAndRunRecoveryTraceContract,
} from './route-and-run-recovery-trace.contract';

describe('route-and-run-recovery-trace.contract — §13.E / I5 recovery observability', () => {
  it('accepts absent recovery fields', () => {
    const r = validateRouteAndRunRecoveryTraceContract({});
    expect(r.valid).toBe(true);
  });

  it('accepts zero retries with empty trace', () => {
    const r = validateRouteAndRunRecoveryTraceContract({
      recovery_retry_attempts: 0,
      recovery_trace: [],
    });
    expect(r.valid).toBe(true);
  });

  it('rejects recovery_retry_attempts > 0 without trace', () => {
    const r = validateRouteAndRunRecoveryTraceContract({ recovery_retry_attempts: 2 });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('requires recovery_trace'))).toBe(true);
  });

  it('rejects length mismatch', () => {
    const r = validateRouteAndRunRecoveryTraceContract({
      recovery_retry_attempts: 2,
      recovery_trace: [{ attempt: 1, backoff_ms: 10 }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('must equal'))).toBe(true);
  });

  it('accepts a valid success-path trace (strict wall-clock)', () => {
    const r = validateRouteAndRunRecoveryTraceContract(
      {
        recovery_retry_attempts: 2,
        recovery_trace: [
          {
            attempt: 1,
            backoff_ms: 50,
            failure_code: 'LIVE_TOOL_TIMEOUT',
            elapsed_ms: 120,
            recorded_at: '2026-05-06T12:00:00.000Z',
          },
          {
            attempt: 2,
            backoff_ms: 100,
            failure_code: 'LIVE_TOOL_TIMEOUT',
            elapsed_ms: 280,
            recorded_at: '2026-05-06T12:00:00.100Z',
          },
        ],
      },
      { requireWallClockFields: true },
    );
    expect(r.valid).toBe(true);
  });

  it('rejects missing elapsed_ms when requireWallClockFields', () => {
    const r = validateRouteAndRunRecoveryTraceContract(
      {
        recovery_retry_attempts: 1,
        recovery_trace: [{ attempt: 1, backoff_ms: 50, recorded_at: '2026-05-06T12:00:00.000Z' }],
      },
      { requireWallClockFields: true },
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('elapsed_ms'))).toBe(true);
  });
});
