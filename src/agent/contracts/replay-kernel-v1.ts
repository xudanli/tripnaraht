// src/agent/contracts/replay-kernel-v1.ts
/**
 * 纯函数回放核 v1：trace → 执行模型实例 + 决策重构 + 确定性结构仿真（无 IO / 无 router / 无 validate）。
 * 与 §18 `ReplayExecutionKernel`（可注入执行）正交：本模块为「解释器层」结构闭包。
 * @see semantic-validation-contract.md §19–§20
 */
import { executionTimelineInputHash } from '../runtime/execution-timeline-hash.util';
import type { ExecutionModelRuntimeRouterReason } from '../runtime/execution-model-runtime-router';
import {
  ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID,
  ORCHESTRATION_EXECUTION_TRACE_V1_VERSION,
  type ExecutionTraceV1RouteDecisionPath,
  type OrchestrationExecutionTraceV1,
} from './orchestration-execution-trace-v1.types';

export const EXECUTION_MODEL_INSTANCE_V1_SCHEMA_ID = 'agent.replay.execution_model_instance@v1' as const;
export const RECONSTRUCTED_DECISION_V1_SCHEMA_ID = 'agent.replay.reconstructed_decision@v1' as const;
export const REPLAY_KERNEL_PURE_CONTEXT_V1_SCHEMA_ID = 'agent.replay.pure_context@v1' as const;
export const REPLAY_KERNEL_PURE_SIMULATION_V1_SCHEMA_ID = 'agent.replay.pure_simulation@v1' as const;
export const REPLAY_EQUIVALENCE_V1_SCHEMA_ID = 'agent.replay.equivalence_assertion@v1' as const;

const KERNEL_SLICE_VERSION = 1 as const;

export type ExecutionModelInstanceV1 = {
  schemaId: typeof EXECUTION_MODEL_INSTANCE_V1_SCHEMA_ID;
  version: typeof KERNEL_SLICE_VERSION;
  snapshot_id: string;
  model_fingerprint: string;
  execution_model_version: string;
};

export type ReconstructedDecisionContextV1 = {
  schemaId: typeof RECONSTRUCTED_DECISION_V1_SCHEMA_ID;
  version: typeof KERNEL_SLICE_VERSION;
  selected_execution_model_version: string;
  selection_reason: ExecutionModelRuntimeRouterReason;
  route_decision_path: ExecutionTraceV1RouteDecisionPath;
};

export type ReplayKernelPureContextV1 = {
  schemaId: typeof REPLAY_KERNEL_PURE_CONTEXT_V1_SCHEMA_ID;
  version: typeof KERNEL_SLICE_VERSION;
  model: ExecutionModelInstanceV1;
  decision: ReconstructedDecisionContextV1;
};

export type ReplayKernelPureSimulationV1 = {
  schemaId: typeof REPLAY_KERNEL_PURE_SIMULATION_V1_SCHEMA_ID;
  version: typeof KERNEL_SLICE_VERSION;
  /** 对 `ReplayKernelPureContextV1` 的确定性摘要（非 nonce） */
  context_hash: string;
  /** 整条 trace 的结构摘要（同 trace → 同值） */
  structural_signature: string;
};

export type ReplayKernelV1Ok = {
  ok: true;
  model: ExecutionModelInstanceV1;
  decision: ReconstructedDecisionContextV1;
  context: ReplayKernelPureContextV1;
  simulation: ReplayKernelPureSimulationV1;
};

export type ReplayKernelV1Err = {
  ok: false;
  error: 'trace_invalid';
  message: string;
};

export type ReplayKernelV1Result = ReplayKernelV1Ok | ReplayKernelV1Err;

export type ReplayEquivalenceV1 = {
  schemaId: typeof REPLAY_EQUIVALENCE_V1_SCHEMA_ID;
  version: typeof KERNEL_SLICE_VERSION;
  equivalent: boolean;
  mismatches: readonly string[];
};

function assertTraceShape(trace: OrchestrationExecutionTraceV1): void {
  if (
    trace.schemaId !== ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID ||
    trace.version !== ORCHESTRATION_EXECUTION_TRACE_V1_VERSION
  ) {
    throw new TypeError('ReplayKernelV1: unsupported OrchestrationExecutionTraceV1');
  }
}

/** Step 1 — 纯数据：由 trace 字段唯一确定（不读 ledger / 不做 validate） */
export function reconstructExecutionModelInstance(trace: OrchestrationExecutionTraceV1): ExecutionModelInstanceV1 {
  assertTraceShape(trace);
  return {
    schemaId: EXECUTION_MODEL_INSTANCE_V1_SCHEMA_ID,
    version: KERNEL_SLICE_VERSION,
    snapshot_id: trace.snapshot_id,
    model_fingerprint: trace.model_fingerprint,
    execution_model_version: trace.selected_execution_model_version,
  };
}

/** Step 2 — 不执行 router：直接冻结 trace 中的路由与选择语义 */
export function reconstructDecisionContext(trace: OrchestrationExecutionTraceV1): ReconstructedDecisionContextV1 {
  assertTraceShape(trace);
  return {
    schemaId: RECONSTRUCTED_DECISION_V1_SCHEMA_ID,
    version: KERNEL_SLICE_VERSION,
    selected_execution_model_version: trace.selected_execution_model_version,
    selection_reason: trace.selection_reason,
    route_decision_path: { ...trace.route_decision_path },
  };
}

export function buildReplayKernelPureContext(trace: OrchestrationExecutionTraceV1): ReplayKernelPureContextV1 {
  const model = reconstructExecutionModelInstance(trace);
  const decision = reconstructDecisionContext(trace);
  return {
    schemaId: REPLAY_KERNEL_PURE_CONTEXT_V1_SCHEMA_ID,
    version: KERNEL_SLICE_VERSION,
    model,
    decision,
  };
}

/**
 * Step 3 — 确定性结构仿真（非 Nest / 非 LLM；仅哈希闭包）。
 * `traceForStructural` 须与构造 `context` 时同源，以保证「同 trace → 同 structural_signature」。
 */
export function simulateDeterministicReplay(
  context: ReplayKernelPureContextV1,
  traceForStructural: OrchestrationExecutionTraceV1,
): ReplayKernelPureSimulationV1 {
  const context_hash =
    executionTimelineInputHash({
      model: context.model,
      decision: context.decision,
    }) ?? '';
  const structural_signature = executionTimelineInputHash(traceForStructural) ?? '';
  return {
    schemaId: REPLAY_KERNEL_PURE_SIMULATION_V1_SCHEMA_ID,
    version: KERNEL_SLICE_VERSION,
    context_hash,
    structural_signature,
  };
}

/**
 * 纯解释器入口：同 trace → 同 `simulation`（在 §16 trace ABI 不变前提下）。
 * **禁止：** 内嵌 IO、router、semantic validate。
 */
export function replayKernelV1FromTrace(trace: OrchestrationExecutionTraceV1): ReplayKernelV1Result {
  try {
    const context = buildReplayKernelPureContext(trace);
    const simulation = simulateDeterministicReplay(context, trace);
    return {
      ok: true,
      model: context.model,
      decision: context.decision,
      context,
      simulation,
    };
  } catch (e) {
    return {
      ok: false,
      error: 'trace_invalid',
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** @alias 文档中的 `runMainChainPure`：结构级确定性仿真（无运行时主链调用） */
export function runMainChainPure(
  context: ReplayKernelPureContextV1,
  traceForStructural: OrchestrationExecutionTraceV1,
): ReplayKernelPureSimulationV1 {
  return simulateDeterministicReplay(context, traceForStructural);
}

function fieldEqual(a: unknown, b: unknown): boolean {
  return a === b;
}

/**
 * 结构对齐（含 `runtime_hint`）；返回 `mismatches`。**语义执行等价类**（忽略 hint、仅 boolean）见 `execution-equivalence-kernel.ts` §21。
 */
export function assertReplayEquivalence(
  traceA: OrchestrationExecutionTraceV1,
  traceB: OrchestrationExecutionTraceV1,
): ReplayEquivalenceV1 {
  const mismatches: string[] = [];
  const safe = (cond: boolean, key: string) => {
    if (!cond) mismatches.push(key);
  };

  safe(traceA.schemaId === traceB.schemaId, 'schemaId');
  safe(traceA.version === traceB.version, 'version');
  safe(traceA.snapshot_id === traceB.snapshot_id, 'snapshot_id');
  safe(traceA.model_fingerprint === traceB.model_fingerprint, 'model_fingerprint');
  safe(traceA.selected_execution_model_version === traceB.selected_execution_model_version, 'selected_execution_model_version');
  safe(traceA.selection_reason === traceB.selection_reason, 'selection_reason');
  safe(traceA.runtime_hint === traceB.runtime_hint, 'runtime_hint');

  const ra = traceA.route_decision_path;
  const rb = traceB.route_decision_path;
  safe(ra.task_type === rb.task_type, 'route_decision_path.task_type');
  safe(ra.route_policy_resolved === rb.route_policy_resolved, 'route_decision_path.route_policy_resolved');
  safe(fieldEqual(ra.intent_mode_requested, rb.intent_mode_requested), 'route_decision_path.intent_mode_requested');
  safe(fieldEqual(ra.intent_mode_resolved, rb.intent_mode_resolved), 'route_decision_path.intent_mode_resolved');

  return {
    schemaId: REPLAY_EQUIVALENCE_V1_SCHEMA_ID,
    version: KERNEL_SLICE_VERSION,
    equivalent: mismatches.length === 0,
    mismatches,
  };
}

/** 命名空间导出，对齐文档 `ReplayKernelV1` */
export const ReplayKernelV1 = {
  replayFromTrace: replayKernelV1FromTrace,
  reconstructExecutionModelInstance,
  reconstructDecisionContext,
  buildReplayKernelPureContext,
  simulateDeterministicReplay,
  runMainChainPure,
  assertReplayEquivalence,
} as const;
