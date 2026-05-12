// src/agent/runtime/execution-model-runtime-router.spec.ts
import { EXECUTION_MODEL_RUNTIME_ROUTER } from './execution-model-runtime-router';

describe('ExecutionModelRuntimeRouter', () => {
  const snap = '00000000-0000-4000-8000-000000000001';

  it('exact_match when no declared version (host default)', () => {
    expect(EXECUTION_MODEL_RUNTIME_ROUTER.select({ snapshotId: snap })).toEqual({
      selectedExecutionModelVersion: 'v1',
      reason: 'exact_match',
    });
  });

  it('exact_match when declared version matches host', () => {
    expect(
      EXECUTION_MODEL_RUNTIME_ROUTER.select({
        snapshotId: snap,
        executionModelVersion: 'v1',
      }),
    ).toEqual({ selectedExecutionModelVersion: 'v1', reason: 'exact_match' });
  });

  it('fallback when declared newer than host', () => {
    expect(
      EXECUTION_MODEL_RUNTIME_ROUTER.select({
        snapshotId: snap,
        executionModelVersion: 'v2',
      }),
    ).toEqual({ selectedExecutionModelVersion: 'v1', reason: 'fallback' });
  });

  it('fallback when unknown declared version', () => {
    expect(
      EXECUTION_MODEL_RUNTIME_ROUTER.select({
        snapshotId: snap,
        executionModelVersion: 'v9',
      }),
    ).toEqual({ selectedExecutionModelVersion: 'v1', reason: 'fallback' });
  });
});
