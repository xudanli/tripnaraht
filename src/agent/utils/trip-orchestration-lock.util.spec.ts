import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import {
  evaluateClientPlanVersionConflict,
  shouldAcquireTripOrchestrationLock,
  tripOrchestrationLockResourceId,
} from './trip-orchestration-lock.util';
import type { RoutingSignals } from './orchestration-signals.util';

function signals(taskType: RoutingSignals['taskType']): RoutingSignals {
  return {
    taskType,
    risk: 'LOW',
    needsAudit: false,
    latencyBudgetMs: 60_000,
    complexity: 'SIMPLE',
    requiresStructuredOutput: false,
    expectsToolCalls: false,
    legacyWellSupported: true,
    intent_mode_requested: 'AUTO',
    intent_mode_resolved: 'GENERIC_QA',
  };
}

function req(partial: Partial<RouteAndRunRequestDto> = {}): RouteAndRunRequestDto {
  return {
    request_id: 'r1',
    message: 'test',
    trip_id: 'trip-1',
    ...partial,
  } as RouteAndRunRequestDto;
}

describe('trip-orchestration-lock.util', () => {
  const prev = process.env.TRIP_ORCHESTRATION_LOCK_ENABLED;

  afterEach(() => {
    if (prev === undefined) delete process.env.TRIP_ORCHESTRATION_LOCK_ENABLED;
    else process.env.TRIP_ORCHESTRATION_LOCK_ENABLED = prev;
  });

  it('tripOrchestrationLockResourceId is stable', () => {
    expect(tripOrchestrationLockResourceId('abc')).toBe('trip_orchestration:abc');
  });

  it('write task with trip acquires lock', () => {
    process.env.TRIP_ORCHESTRATION_LOCK_ENABLED = '1';
    expect(shouldAcquireTripOrchestrationLock(req(), signals('TRIP_PLANNING'))).toBe(true);
  });

  it('read task skips lock', () => {
    process.env.TRIP_ORCHESTRATION_LOCK_ENABLED = '1';
    expect(shouldAcquireTripOrchestrationLock(req(), signals('RAG_QA'))).toBe(false);
  });

  it('dry_run skips lock', () => {
    process.env.TRIP_ORCHESTRATION_LOCK_ENABLED = '1';
    expect(
      shouldAcquireTripOrchestrationLock(
        req({ options: { dry_run: true } as RouteAndRunRequestDto['options'] }),
        signals('TRIP_PLANNING'),
      ),
    ).toBe(false);
  });

  it('evaluateClientPlanVersionConflict detects stale client', () => {
    const stale = evaluateClientPlanVersionConflict({ clientVersion: 10, serverVersion: 11 });
    expect(stale.conflict).toBe(true);
    expect(stale.serverVersion).toBe(11);
    expect(stale.clientVersion).toBe(10);
    expect(evaluateClientPlanVersionConflict({ clientVersion: 11, serverVersion: 11 }).conflict).toBe(
      false,
    );
  });
});
