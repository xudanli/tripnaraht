import type { RouteAndRunTaskProgressPayload, RouteAndRunTaskSseEventType } from '../events/route-and-run-task.events';
import type { RouteAndRunTaskRecord } from '../services/route-and-run-async-task.store';
import { isTerminalTaskPublicStatus } from '../runtime/route-and-run-orchestration-progress.util';
import { enrichSseProgressWithCanvasHint } from '../runtime/golden-path-sse-canvas-contract.util';

export function taskRecordToProgressPayload(
  record: RouteAndRunTaskRecord,
  type: RouteAndRunTaskSseEventType,
): RouteAndRunTaskProgressPayload {
  const base: RouteAndRunTaskProgressPayload = {
    task_id: record.task_id,
    request_id: record.request_id,
    type,
    current_phase: record.current_phase,
    progress_percentage: record.progress_percentage,
    message: record.message,
    status: record.status,
    ts: record.updated_at,
    ...(record.error ? { error: record.error } : {}),
    ...(type === 'RESULT' ? { data: record.data ?? null } : {}),
  };
  return enrichSseProgressWithCanvasHint(base);
}

export function terminalPayloadTypeForRecord(
  record: RouteAndRunTaskRecord,
): 'RESULT' | 'ERROR' | null {
  if (!isTerminalTaskPublicStatus(record.status)) return null;
  return record.status === 'SUCCESS' ? 'RESULT' : 'ERROR';
}
