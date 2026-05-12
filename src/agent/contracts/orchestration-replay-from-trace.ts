// src/agent/contracts/orchestration-replay-from-trace.ts
/**
 * 从 §16 `OrchestrationExecutionTraceV1` 生成可合并的 replay 轮廓，并委托 runner 再入 `route_and_run`。
 * 不加载 DB / 内存：调用方须在 `baseRequest` 中已绑定 `snapshot_id` 对应冻结上下文（若需要）。
 * @see semantic-validation-contract.md §17
 */
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { INTENT_MODE_VALUES, type IntentMode } from '../constants/intent-mode.constants';
import type { OrchestrationExecutionTraceV1 } from './orchestration-execution-trace-v1.types';

export const ORCHESTRATION_REPLAY_PROFILE_V1_SCHEMA_ID = 'agent.orchestration.replay_profile@v1' as const;
export const ORCHESTRATION_REPLAY_PROFILE_V1_VERSION = 1 as const;

export type OrchestrationReplayOptionsOverlayV1 = {
  intent_mode?: IntentMode;
  execution_model_version?: string;
  execution_model_allow_upgrade?: boolean;
  execution_model_runtime_hint?: string | null;
  use_claude_orchestration?: boolean;
  use_state_machine_orchestration?: boolean;
};

export type OrchestrationReplayProfileV1 = {
  schemaId: typeof ORCHESTRATION_REPLAY_PROFILE_V1_SCHEMA_ID;
  version: typeof ORCHESTRATION_REPLAY_PROFILE_V1_VERSION;
  source_trace: OrchestrationExecutionTraceV1;
  /** 合并进 `RouteAndRunRequestDto.options` 的确定性覆盖 */
  options_overlay: OrchestrationReplayOptionsOverlayV1;
  /** 与 trace 一致；调用方应保证 memory / request 与该 id 对齐 */
  snapshot_id: string;
};

function parseIntentMode(v: string | undefined): IntentMode | undefined {
  if (!v) return undefined;
  return (INTENT_MODE_VALUES as readonly string[]).includes(v) ? (v as IntentMode) : undefined;
}

function routePolicyToOrchestrationOptions(mode: string): Pick<
  OrchestrationReplayOptionsOverlayV1,
  'use_claude_orchestration' | 'use_state_machine_orchestration'
> {
  switch (mode) {
    case 'CLAUDE_SM':
      return { use_claude_orchestration: true, use_state_machine_orchestration: true };
    case 'CLAUDE_DYNAMIC':
      return { use_claude_orchestration: true, use_state_machine_orchestration: false };
    case 'LEGACY':
      return { use_claude_orchestration: false, use_state_machine_orchestration: false };
    default:
      return {};
  }
}

/** 由正式 trace 构造 replay 轮廓（纯函数） */
export function buildReplayProfileFromTrace(trace: OrchestrationExecutionTraceV1): OrchestrationReplayProfileV1 {
  const route = trace.route_decision_path;
  const intent = parseIntentMode(route.intent_mode_resolved);
  const orch = routePolicyToOrchestrationOptions(route.route_policy_resolved);
  const options_overlay: OrchestrationReplayOptionsOverlayV1 = {
    ...orch,
    ...(intent !== undefined ? { intent_mode: intent } : {}),
    execution_model_version: trace.selected_execution_model_version,
    execution_model_allow_upgrade: trace.selection_reason === 'upgrade_allowed',
    execution_model_runtime_hint: trace.runtime_hint,
  };
  return {
    schemaId: ORCHESTRATION_REPLAY_PROFILE_V1_SCHEMA_ID,
    version: ORCHESTRATION_REPLAY_PROFILE_V1_VERSION,
    source_trace: trace,
    options_overlay,
    snapshot_id: trace.snapshot_id,
  };
}

/** @alias 口语/文档中的 `buildReplayFromTrace` */
export const buildReplayFromTrace = buildReplayProfileFromTrace;

export function mergeReplayProfileIntoRouteAndRunRequest(
  baseRequest: RouteAndRunRequestDto,
  profile: OrchestrationReplayProfileV1,
): RouteAndRunRequestDto {
  const o = profile.options_overlay;
  return {
    ...baseRequest,
    options: {
      ...(baseRequest.options ?? {}),
      ...o,
    },
  };
}

/**
 * 将 trace 转为 options 覆盖并调用注入的 `runner`（通常为 `ExecutionGatewayService.runRouteAndRun`）。
 * **不**实现快照 I/O；`baseRequest` 须已由调用方准备好与 `trace.snapshot_id` 一致的记忆绑定（若需要）。
 */
export async function replayExecutionFromTrace(
  baseRequest: RouteAndRunRequestDto,
  trace: OrchestrationExecutionTraceV1,
  runner: (request: RouteAndRunRequestDto) => Promise<unknown>,
): Promise<unknown> {
  const merged = mergeReplayProfileIntoRouteAndRunRequest(baseRequest, buildReplayProfileFromTrace(trace));
  return runner(merged);
}
