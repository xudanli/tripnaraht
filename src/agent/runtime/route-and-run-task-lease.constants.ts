/**
 * P2 — Async Worker Lease：task_progress 心跳 TTL + 断点续跑上限。
 */

/** 单次 lease 窗口：超过此时间无 heartbeat 更新则判定 Worker 挂起（秒） */
export const ROUTE_AND_RUN_TASK_LEASE_SEC_DEFAULT = 90;
export const ROUTE_AND_RUN_TASK_LEASE_SEC_ENV = 'ROUTE_AND_RUN_TASK_LEASE_SEC';

/** 同一 task_id 允许的最大自动/手动 resume 次数 */
export const ROUTE_AND_RUN_TASK_MAX_RESUME_DEFAULT = 2;
export const ROUTE_AND_RUN_TASK_MAX_RESUME_ENV = 'ROUTE_AND_RUN_TASK_MAX_RESUME';

export type TaskLeaseStatus = 'ACTIVE' | 'STALE' | 'RESUMING' | 'EXHAUSTED';

export interface TaskLeaseEchoV1 {
  schemaId: 'tripnara.route_and_run_task_lease@v1';
  version: 1;
  lease_status: TaskLeaseStatus;
  heartbeat_at: string;
  lease_ttl_sec: number;
  resume_count: number;
  max_resume: number;
  durable_trip_run_id?: string | null;
  worker_instance_id?: string;
}

function parseBoundedInt(raw: string | undefined, fallback: number, min: number): number {
  const n = parseInt(raw ?? String(fallback), 10);
  if (!Number.isFinite(n) || n < min) return fallback;
  return n;
}

export function parseTaskLeaseTtlSec(env: NodeJS.ProcessEnv = process.env): number {
  return parseBoundedInt(
    env[ROUTE_AND_RUN_TASK_LEASE_SEC_ENV],
    ROUTE_AND_RUN_TASK_LEASE_SEC_DEFAULT,
    15,
  );
}

export function parseTaskMaxResume(env: NodeJS.ProcessEnv = process.env): number {
  return parseBoundedInt(
    env[ROUTE_AND_RUN_TASK_MAX_RESUME_ENV],
    ROUTE_AND_RUN_TASK_MAX_RESUME_DEFAULT,
    0,
  );
}

export function buildWorkerInstanceId(): string {
  return `worker_${process.pid}_${Date.now().toString(36)}`;
}
