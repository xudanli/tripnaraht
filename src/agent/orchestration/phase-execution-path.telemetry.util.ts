/**
 * Phase execution path telemetry — Kernel vs legacy / Narrator fallback 必须显式可观测。
 * Schema: tripnara.phase_execution_path@v1
 */

import type { OrchestrationStep, OrchestratorState, SubAgentType } from '../interfaces/trip-plan.interface';

export const PHASE_EXECUTION_PATH_SCHEMA_ID = 'tripnara.phase_execution_path@v1' as const;

export type PhaseExecutionPathKind =
  | 'kernel_native'
  | 'legacy_callback'
  | 'narrator_agent'
  | 'kernel_missing_dso'
  | 'kernel_missing_service';

export type PhaseExecutionPathReason =
  | 'native_enabled'
  | 'flag_off'
  | 'gray_miss'
  | 'missing_dso'
  | 'missing_kernel'
  | 'empty_narrative'
  | 'missing_gate_or_itinerary'
  | 'scoped_partial_degraded_to_full'
  | 'r2r_forced_full_empty_prior'
  | 'explicit_legacy';

export interface PhaseExecutionPathV1 {
  schemaId: typeof PHASE_EXECUTION_PATH_SCHEMA_ID;
  version: 1;
  phase: string;
  path: PhaseExecutionPathKind;
  reason: PhaseExecutionPathReason;
  at: string;
}

export type PhaseExecutionPathSystemAction =
  | 'KERNEL_NATIVE'
  | 'KERNEL_LEGACY_FALLBACK'
  | 'NARRATOR_AGENT_FALLBACK'
  | 'KERNEL_MISSING_FALLBACK';

export function pathKindToSystemAction(path: PhaseExecutionPathKind): PhaseExecutionPathSystemAction {
  switch (path) {
    case 'kernel_native':
      return 'KERNEL_NATIVE';
    case 'narrator_agent':
      return 'NARRATOR_AGENT_FALLBACK';
    case 'kernel_missing_dso':
    case 'kernel_missing_service':
      return 'KERNEL_MISSING_FALLBACK';
    default:
      return 'KERNEL_LEGACY_FALLBACK';
  }
}

export function buildPhaseExecutionPathV1(input: {
  phase: string;
  path: PhaseExecutionPathKind;
  reason: PhaseExecutionPathReason;
  at?: string;
}): PhaseExecutionPathV1 {
  return {
    schemaId: PHASE_EXECUTION_PATH_SCHEMA_ID,
    version: 1,
    phase: input.phase,
    path: input.path,
    reason: input.reason,
    at: input.at ?? new Date().toISOString(),
  };
}

/**
 * 写入 decision_log + metadata.phase_execution_paths_v1（累积），禁止静默降级。
 */
export function emitPhaseExecutionPath(
  state: OrchestratorState,
  input: {
    phase: string;
    path: PhaseExecutionPathKind;
    reason: PhaseExecutionPathReason;
    step?: OrchestrationStep;
    loggerWarn?: (msg: string) => void;
  },
): PhaseExecutionPathV1 {
  const record = buildPhaseExecutionPathV1({
    phase: input.phase,
    path: input.path,
    reason: input.reason,
  });
  const systemAction = pathKindToSystemAction(input.path);
  const step = (input.step ?? input.phase) as OrchestrationStep;

  if (input.path !== 'kernel_native') {
    input.loggerWarn?.(
      `[phase_execution_path_v1] phase=${record.phase} path=${record.path} reason=${record.reason} request_id=${state.request_id}`,
    );
  }

  state.decision_log.push({
    request_id: state.request_id,
    step,
    actor: 'Orchestrator' as SubAgentType,
    inputs_summary: `phase_execution_path_v1 phase=${record.phase}`,
    outputs_summary: `${systemAction}: path=${record.path} reason=${record.reason}`,
    evidence_refs: [],
    timestamp: record.at,
    metadata: {
      system_action: systemAction,
      phase_execution_path_v1: record,
    },
  });

  const meta = { ...(state.metadata as Record<string, unknown>) };
  const prev = Array.isArray(meta.phase_execution_paths_v1)
    ? (meta.phase_execution_paths_v1 as PhaseExecutionPathV1[])
    : [];
  meta.phase_execution_paths_v1 = [...prev, record];
  meta.last_phase_execution_path_v1 = record;
  state.metadata = meta as OrchestratorState['metadata'];

  return record;
}
