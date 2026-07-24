/**
 * Agent 任务级 rollback：从 checkpoint catalog 选取 step N / checkpoint_id 恢复执行图。
 */

import type { AgenticLoopCheckpointV1 } from './agentic-loop-checkpoint.util';
import {
  parseAgenticLoopCheckpointV1,
  validateAgenticResumeCheckpoint,
} from './agentic-loop-checkpoint.util';

export interface AgenticTaskRollbackObservabilityV1 {
  schemaId: 'tripnara.agentic_task_rollback@v1';
  version: 1;
  applied: boolean;
  rolled_back_to_step: number | null;
  rolled_back_from_step: number | null;
  checkpoint_id: string | null;
  selection: 'step' | 'checkpoint_id' | 'direct_resume' | null;
  skip_reason?: 'not_requested' | 'catalog_empty' | 'target_not_found' | 'invalid_checkpoint';
}

export type AgenticTaskRollbackResolution =
  | {
      ok: true;
      checkpoint: AgenticLoopCheckpointV1;
      rolled_back_to_step: number;
      rolled_back_from_step: number | null;
      selection: 'step' | 'checkpoint_id';
    }
  | { ok: false; reason: string };

export function parseAgenticCheckpointCatalogV1(raw: unknown): AgenticLoopCheckpointV1[] {
  if (!Array.isArray(raw)) return [];
  const out: AgenticLoopCheckpointV1[] = [];
  for (const item of raw) {
    const cp = parseAgenticLoopCheckpointV1(item);
    if (cp) out.push(cp);
  }
  return out.sort((a, b) => a.step - b.step);
}

export function resolveAgenticTaskRollback(params: {
  taskMessage: string;
  catalog: AgenticLoopCheckpointV1[];
  targetStep?: number | null;
  targetCheckpointId?: string | null;
}): AgenticTaskRollbackResolution {
  const catalog = params.catalog;
  if (!catalog.length) {
    return { ok: false, reason: 'catalog_empty' };
  }

  const fromStep = catalog[catalog.length - 1]?.step ?? null;
  const checkpointId = params.targetCheckpointId?.trim();
  if (checkpointId) {
    const cp = catalog.find((c) => c.checkpoint_id === checkpointId);
    if (!cp) return { ok: false, reason: 'target_not_found' };
    const validation = validateAgenticResumeCheckpoint(cp, params.taskMessage);
    if (validation.ok === false) return { ok: false, reason: validation.reason };
    return {
      ok: true,
      checkpoint: cp,
      rolled_back_to_step: cp.step,
      rolled_back_from_step: fromStep,
      selection: 'checkpoint_id',
    };
  }

  const stepRaw = params.targetStep;
  if (stepRaw == null || !Number.isFinite(stepRaw)) {
    return { ok: false, reason: 'missing_target' };
  }
  const targetStep = Math.floor(stepRaw);
  const cp = catalog.find((c) => c.step === targetStep);
  if (!cp) return { ok: false, reason: 'target_not_found' };
  const validation = validateAgenticResumeCheckpoint(cp, params.taskMessage);
  if (validation.ok === false) return { ok: false, reason: validation.reason };
  return {
    ok: true,
    checkpoint: cp,
    rolled_back_to_step: cp.step,
    rolled_back_from_step: fromStep,
    selection: 'step',
  };
}

export interface AgenticResumeCheckpointRequestOptions {
  agentic_resume_checkpoint_v1?: Record<string, unknown>;
  agentic_checkpoint_catalog_v1?: unknown;
  agentic_rollback_to_step_v1?: number;
  agentic_rollback_to_checkpoint_id_v1?: string;
}

export function resolveAgenticResumeCheckpointFromRequestOptions(
  options: AgenticResumeCheckpointRequestOptions | undefined,
  taskMessage: string,
):
  | {
      checkpoint: AgenticLoopCheckpointV1;
      rollbackObs: AgenticTaskRollbackObservabilityV1;
    }
  | { checkpoint: null; rollbackObs: AgenticTaskRollbackObservabilityV1 }
  | { error: string; rollbackObs: AgenticTaskRollbackObservabilityV1 } {
  const notRequestedObs = (): AgenticTaskRollbackObservabilityV1 => ({
    schemaId: 'tripnara.agentic_task_rollback@v1',
    version: 1,
    applied: false,
    rolled_back_to_step: null,
    rolled_back_from_step: null,
    checkpoint_id: null,
    selection: null,
    skip_reason: 'not_requested',
  });

  const targetStep = options?.agentic_rollback_to_step_v1;
  const targetCheckpointId = options?.agentic_rollback_to_checkpoint_id_v1;
  const hasRollbackTarget =
    (targetStep != null && Number.isFinite(targetStep)) || !!targetCheckpointId?.trim();

  if (hasRollbackTarget) {
    const catalog = parseAgenticCheckpointCatalogV1(options?.agentic_checkpoint_catalog_v1);
    const resolved = resolveAgenticTaskRollback({
      taskMessage,
      catalog,
      targetStep,
      targetCheckpointId,
    });
    if (resolved.ok === false) {
      return {
        error: resolved.reason,
        rollbackObs: {
          schemaId: 'tripnara.agentic_task_rollback@v1',
          version: 1,
          applied: false,
          rolled_back_to_step: null,
          rolled_back_from_step: null,
          checkpoint_id: null,
          selection: null,
          skip_reason:
            resolved.reason === 'catalog_empty'
              ? 'catalog_empty'
              : resolved.reason === 'target_not_found'
                ? 'target_not_found'
                : 'invalid_checkpoint',
        },
      };
    }
    return {
      checkpoint: resolved.checkpoint,
      rollbackObs: {
        schemaId: 'tripnara.agentic_task_rollback@v1',
        version: 1,
        applied: true,
        rolled_back_to_step: resolved.rolled_back_to_step,
        rolled_back_from_step: resolved.rolled_back_from_step,
        checkpoint_id: resolved.checkpoint.checkpoint_id,
        selection: resolved.selection,
      },
    };
  }

  const direct = parseAgenticLoopCheckpointV1(options?.agentic_resume_checkpoint_v1);
  if (direct) {
    const validation = validateAgenticResumeCheckpoint(direct, taskMessage);
    if (validation.ok === false) {
      return {
        error: validation.reason,
        rollbackObs: {
          schemaId: 'tripnara.agentic_task_rollback@v1',
          version: 1,
          applied: false,
          rolled_back_to_step: null,
          rolled_back_from_step: null,
          checkpoint_id: direct.checkpoint_id,
          selection: 'direct_resume',
          skip_reason: 'invalid_checkpoint',
        },
      };
    }
    return {
      checkpoint: direct,
      rollbackObs: {
        schemaId: 'tripnara.agentic_task_rollback@v1',
        version: 1,
        applied: true,
        rolled_back_to_step: direct.step,
        rolled_back_from_step: null,
        checkpoint_id: direct.checkpoint_id,
        selection: 'direct_resume',
      },
    };
  }

  return { checkpoint: null, rollbackObs: notRequestedObs() };
}

export function readAgenticTaskRollbackObservabilityFromTrace(trace: unknown): AgenticTaskRollbackObservabilityV1 | null {
  if (!trace || typeof trace !== 'object' || Array.isArray(trace)) return null;
  const rb = (trace as { task_rollback_v1?: unknown }).task_rollback_v1;
  if (!rb || typeof rb !== 'object' || Array.isArray(rb)) return null;
  const o = rb as AgenticTaskRollbackObservabilityV1;
  return o.schemaId === 'tripnara.agentic_task_rollback@v1' ? o : null;
}
