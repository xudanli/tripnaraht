import type { RouteAndRunTaskRecord } from '../services/route-and-run-async-task.store';
import {
  parseTaskLeaseTtlSec,
  parseTaskMaxResume,
  type TaskLeaseEchoV1,
  type TaskLeaseStatus,
} from './route-and-run-task-lease.constants';

export function taskHeartbeatAgeMs(record: RouteAndRunTaskRecord, nowMs = Date.now()): number {
  const hb = record.heartbeat_at ?? record.updated_at;
  const t = Date.parse(hb);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowMs - t);
}

export function isTaskLeaseStale(
  record: RouteAndRunTaskRecord,
  env: NodeJS.ProcessEnv = process.env,
  nowMs = Date.now(),
): boolean {
  if (record.status !== 'PROCESSING' && record.status !== 'PENDING') {
    return false;
  }
  const ttlMs = parseTaskLeaseTtlSec(env) * 1000;
  return taskHeartbeatAgeMs(record, nowMs) > ttlMs;
}

export function resolveTaskLeaseStatus(
  record: RouteAndRunTaskRecord,
  env: NodeJS.ProcessEnv = process.env,
  nowMs = Date.now(),
): TaskLeaseStatus {
  if (record.status === 'SUCCESS' || record.status === 'FAILED' || record.status === 'CANCELLED') {
    return 'ACTIVE';
  }
  if (record.lease_resuming === true) {
    return 'RESUMING';
  }
  const maxResume = parseTaskMaxResume(env);
  if ((record.resume_count ?? 0) >= maxResume && isTaskLeaseStale(record, env, nowMs)) {
    return 'EXHAUSTED';
  }
  if (isTaskLeaseStale(record, env, nowMs)) {
    return 'STALE';
  }
  return 'ACTIVE';
}

export function buildTaskLeaseEchoV1(
  record: RouteAndRunTaskRecord,
  env: NodeJS.ProcessEnv = process.env,
  nowMs = Date.now(),
): TaskLeaseEchoV1 {
  return {
    schemaId: 'tripnara.route_and_run_task_lease@v1',
    version: 1,
    lease_status: resolveTaskLeaseStatus(record, env, nowMs),
    heartbeat_at: record.heartbeat_at ?? record.updated_at,
    lease_ttl_sec: parseTaskLeaseTtlSec(env),
    resume_count: record.resume_count ?? 0,
    max_resume: parseTaskMaxResume(env),
    durable_trip_run_id: record.durable_trip_run_id ?? null,
    worker_instance_id: record.worker_instance_id,
  };
}
