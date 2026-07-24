/**
 * route_and_run 入口：同一 trip 写编排串行化（堵住 ver 相同下的 in-flight 重叠）。
 */
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { RoutingSignals, TaskType } from './orchestration-signals.util';

/** 会 mutate DSO / planDraft 的任务类型 */
const TRIP_WRITE_TASK_TYPES = new Set<TaskType>([
  'TRIP_PLANNING',
  'BOOKING_WORKFLOW',
  'CRUD',
]);

/** 明确只读咨询类：允许并发 NARRATE / 轻量 QA */
const TRIP_READ_TASK_TYPES = new Set<TaskType>([
  'RAG_QA',
  'DATA_LOOKUP',
  'GENERIC_QA',
  'CUSTOMER_SUPPORT',
]);

export function tripOrchestrationLockResourceId(tripId: string): string {
  return `trip_orchestration:${tripId.trim()}`;
}

export function isTripOrchestrationLockEnabled(): boolean {
  const raw = process.env.TRIP_ORCHESTRATION_LOCK_ENABLED;
  if (raw === '0' || raw === 'false') return false;
  return true;
}

/**
 * 是否应在 route_and_run 入口对 tripId 加写编排锁。
 */
export function shouldAcquireTripOrchestrationLock(
  request: RouteAndRunRequestDto,
  signals: RoutingSignals,
): boolean {
  if (!isTripOrchestrationLockEnabled()) return false;
  if (request.options?.dry_run) return false;
  if (request.options?.orchestration_replay_anchor_snapshot_id?.trim()) return false;

  const tripId = request.trip_id?.trim();
  if (!tripId) return false;

  if (TRIP_READ_TASK_TYPES.has(signals.taskType)) return false;
  if (TRIP_WRITE_TASK_TYPES.has(signals.taskType)) return true;

  // 未分类：有 trip 且非纯读 → 保守加锁
  return true;
}

/**
 * 可选：客户端声明的 DSO/plan 版本落后于服务端时快速 409（消极防御，与锁互补）。
 */
export function evaluateClientPlanVersionConflict(input: {
  clientVersion?: number;
  serverVersion?: number;
  /** @deprecated 使用 serverVersion */
  currentVersion?: number;
}): { conflict: boolean; reason?: string; clientVersion?: number; serverVersion?: number } {
  const client = input.clientVersion;
  const server = input.serverVersion ?? input.currentVersion;
  if (client === undefined || server === undefined) {
    return { conflict: false };
  }
  if (!Number.isFinite(client) || !Number.isFinite(server)) {
    return { conflict: false };
  }
  const c = Math.floor(client);
  const s = Math.floor(server);
  if (c < s) {
    return {
      conflict: true,
      reason: `client_dso_version=${c} < server_dso_version=${s}`,
      clientVersion: c,
      serverVersion: s,
    };
  }
  return { conflict: false };
}

export type TripOrchestrationConflictBody = {
  code: 'TRIP_ORCHESTRATION_BUSY' | 'STALE_PLAN_VERSION';
  message: string;
  trip_id: string;
  request_id: string;
  client_dso_version?: number;
  server_dso_version?: number;
};
