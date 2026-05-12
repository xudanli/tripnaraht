// src/agent/contracts/replay-execution-kernel.ts
/**
 * 确定性回放内核：trace 为执行种子；不再次路由、不跑 import 兼容闸门、不修改持久化快照（由 deps 契约保证）。
 * @see semantic-validation-contract.md §18
 */
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { ExecutionModelRuntimeRouterReason } from '../runtime/execution-model-runtime-router';
import {
  buildReplayProfileFromTrace,
  mergeReplayProfileIntoRouteAndRunRequest,
} from './orchestration-replay-from-trace';
import {
  ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID,
  ORCHESTRATION_EXECUTION_TRACE_V1_VERSION,
  type ExecutionTraceV1RouteDecisionPath,
  type OrchestrationExecutionTraceV1,
} from './orchestration-execution-trace-v1.types';

export const REPLAY_EXECUTION_RESULT_V1_SCHEMA_ID = 'agent.orchestration.replay_execution_result@v1' as const;
export const REPLAY_EXECUTION_RESULT_V1_VERSION = 1 as const;

export type ReplayExecutionOutcomeSummaryV1 = {
  result_status: string;
  request_id: string;
};

export type ReplayExecutionResultV1Success = {
  schemaId: typeof REPLAY_EXECUTION_RESULT_V1_SCHEMA_ID;
  version: typeof REPLAY_EXECUTION_RESULT_V1_VERSION;
  snapshot_id: string;
  model_version: string;
  model_fingerprint: string;
  selected_route: ExecutionTraceV1RouteDecisionPath;
  selection_reason: ExecutionModelRuntimeRouterReason;
  execution_outcome: ReplayExecutionOutcomeSummaryV1;
  deterministic: true;
};

export type ReplayExecutionResultV1Failure = {
  schemaId: typeof REPLAY_EXECUTION_RESULT_V1_SCHEMA_ID;
  version: typeof REPLAY_EXECUTION_RESULT_V1_VERSION;
  deterministic: false;
  failure_reason: 'trace_invalid' | 'snapshot_not_found' | 'execution_threw';
  snapshot_id: string;
  message?: string;
};

export type ReplayExecutionResultV1 = ReplayExecutionResultV1Success | ReplayExecutionResultV1Failure;

export type ReplayExecutionKernelDeps = {
  /**
   * 只读：构造与 `snapshotId` 对齐的基线 `RouteAndRunRequestDto`（内存/存储加载须在此完成；不得 mutate 持久化快照）。
   */
  loadBaseRequestForReplay: (snapshotId: string) => Promise<RouteAndRunRequestDto | null>;
  /**
   * 在已合并 trace 路由/模型覆盖的请求上执行。
   * **铁律：** 不得再跑 §15 runtime router、不得再跑 §13 import 兼容闸门；须与「冻结 trace」语义一致。
   */
  executeReplay: (request: RouteAndRunRequestDto) => Promise<RouteAndRunResponseDto>;
};

function assertTraceAccepted(trace: OrchestrationExecutionTraceV1): void {
  if (
    trace.schemaId !== ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID ||
    trace.version !== ORCHESTRATION_EXECUTION_TRACE_V1_VERSION
  ) {
    throw new TypeError('ReplayExecutionKernel: unsupported OrchestrationExecutionTraceV1');
  }
}

function outcomeFromResponse(res: RouteAndRunResponseDto): ReplayExecutionOutcomeSummaryV1 {
  return {
    result_status: res.result?.status ?? 'unknown',
    request_id: res.request_id,
  };
}

export class ReplayExecutionKernel {
  constructor(private readonly deps: ReplayExecutionKernelDeps) {}

  async replayFromTrace(trace: OrchestrationExecutionTraceV1): Promise<ReplayExecutionResultV1> {
    try {
      assertTraceAccepted(trace);
    } catch (e) {
      return {
        schemaId: REPLAY_EXECUTION_RESULT_V1_SCHEMA_ID,
        version: REPLAY_EXECUTION_RESULT_V1_VERSION,
        deterministic: false,
        failure_reason: 'trace_invalid',
        snapshot_id: trace.snapshot_id,
        message: e instanceof Error ? e.message : String(e),
      };
    }

    const base = await this.deps.loadBaseRequestForReplay(trace.snapshot_id);
    if (!base) {
      return {
        schemaId: REPLAY_EXECUTION_RESULT_V1_SCHEMA_ID,
        version: REPLAY_EXECUTION_RESULT_V1_VERSION,
        deterministic: false,
        failure_reason: 'snapshot_not_found',
        snapshot_id: trace.snapshot_id,
      };
    }

    const profile = buildReplayProfileFromTrace(trace);
    const merged = mergeReplayProfileIntoRouteAndRunRequest(base, profile);

    try {
      const res = await this.deps.executeReplay(merged);
      return {
        schemaId: REPLAY_EXECUTION_RESULT_V1_SCHEMA_ID,
        version: REPLAY_EXECUTION_RESULT_V1_VERSION,
        snapshot_id: trace.snapshot_id,
        model_version: trace.selected_execution_model_version,
        model_fingerprint: trace.model_fingerprint,
        selected_route: { ...trace.route_decision_path },
        selection_reason: trace.selection_reason,
        execution_outcome: outcomeFromResponse(res),
        deterministic: true,
      };
    } catch (e) {
      return {
        schemaId: REPLAY_EXECUTION_RESULT_V1_SCHEMA_ID,
        version: REPLAY_EXECUTION_RESULT_V1_VERSION,
        deterministic: false,
        failure_reason: 'execution_threw',
        snapshot_id: trace.snapshot_id,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

export async function replayFromTrace(
  trace: OrchestrationExecutionTraceV1,
  deps: ReplayExecutionKernelDeps,
): Promise<ReplayExecutionResultV1> {
  return new ReplayExecutionKernel(deps).replayFromTrace(trace);
}
