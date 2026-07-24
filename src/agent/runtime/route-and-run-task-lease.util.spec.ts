import type { RouteAndRunTaskRecord } from '../services/route-and-run-async-task.store';
import {
  buildTaskLeaseEchoV1,
  isTaskLeaseStale,
  resolveTaskLeaseStatus,
  taskHeartbeatAgeMs,
} from './route-and-run-task-lease.util';

function makeRecord(overrides: Partial<RouteAndRunTaskRecord> = {}): RouteAndRunTaskRecord {
  const now = new Date().toISOString();
  return {
    task_id: 'task_iceland_1',
    request_id: 'req_1',
    status: 'PROCESSING',
    current_phase: 'PLAN_GEN',
    progress_percentage: 40,
    message: '生成行程…',
    data: null,
    updated_at: now,
    created_at: now,
    heartbeat_at: now,
    resume_count: 0,
    worker_instance_id: 'worker_test',
    ...overrides,
  };
}

describe('route-and-run-task-lease.util', () => {
  const env = { ROUTE_AND_RUN_TASK_LEASE_SEC: '90', ROUTE_AND_RUN_TASK_MAX_RESUME: '2' };
  const nowMs = Date.parse('2026-06-13T12:00:00.000Z');

  it('treats fresh heartbeat as ACTIVE lease', () => {
    const record = makeRecord({
      heartbeat_at: new Date(nowMs - 30_000).toISOString(),
    });
    expect(isTaskLeaseStale(record, env, nowMs)).toBe(false);
    expect(resolveTaskLeaseStatus(record, env, nowMs)).toBe('ACTIVE');
  });

  it('marks stale when heartbeat exceeds TTL', () => {
    const record = makeRecord({
      heartbeat_at: new Date(nowMs - 120_000).toISOString(),
    });
    expect(taskHeartbeatAgeMs(record, nowMs)).toBe(120_000);
    expect(isTaskLeaseStale(record, env, nowMs)).toBe(true);
    expect(resolveTaskLeaseStatus(record, env, nowMs)).toBe('STALE');
  });

  it('returns RESUMING when lease_resuming flag set', () => {
    const record = makeRecord({ lease_resuming: true });
    expect(resolveTaskLeaseStatus(record, env, nowMs)).toBe('RESUMING');
  });

  it('returns EXHAUSTED when stale and resume budget spent', () => {
    const record = makeRecord({
      heartbeat_at: new Date(nowMs - 200_000).toISOString(),
      resume_count: 2,
    });
    expect(resolveTaskLeaseStatus(record, env, nowMs)).toBe('EXHAUSTED');
  });

  it('does not mark terminal tasks stale', () => {
    const record = makeRecord({
      status: 'SUCCESS',
      heartbeat_at: new Date(nowMs - 200_000).toISOString(),
    });
    expect(isTaskLeaseStale(record, env, nowMs)).toBe(false);
    expect(resolveTaskLeaseStatus(record, env, nowMs)).toBe('ACTIVE');
  });

  it('builds task_lease_v1 echo with schema id', () => {
    const record = makeRecord({ durable_trip_run_id: 'trip_run_abc' });
    const echo = buildTaskLeaseEchoV1(record, env, nowMs);
    expect(echo.schemaId).toBe('tripnara.route_and_run_task_lease@v1');
    expect(echo.lease_ttl_sec).toBe(90);
    expect(echo.max_resume).toBe(2);
    expect(echo.durable_trip_run_id).toBe('trip_run_abc');
  });
});
