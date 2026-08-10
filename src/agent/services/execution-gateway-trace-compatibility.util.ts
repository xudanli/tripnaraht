// src/agent/services/execution-gateway-trace-compatibility.util.ts
/**
 * Trace / dedup 工程兼容：`cid-aware`（默认）与 `legacy`（旧缓存观测收口）。
 * 不改变 replay kernel，仅网关与契约解释层。
 */
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';

export type TraceCompatibilityMode = 'legacy' | 'cid-aware';

export const TRACE_COMPATIBILITY_ACK_SCHEMA_ID = 'agent.execution_os.trace_compatibility_ack@v1' as const;

export function resolveTraceCompatibilityMode(request: RouteAndRunRequestDto): TraceCompatibilityMode {
  return request.options?.trace_compatibility_mode === 'legacy' ? 'legacy' : 'cid-aware';
}

function requestMemoryBindingSnapshotId(request: RouteAndRunRequestDto): string | undefined {
  const b = (
    request as RouteAndRunRequestDto & {
      __memoryExecutionBinding?: { snapshot_id?: string };
    }
  ).__memoryExecutionBinding;
  const id = b?.snapshot_id;
  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : undefined;
}

function cachedExecutionTraceSnapshotId(cached: RouteAndRunResponseDto): string | undefined {
  const obs = cached.observability as Record<string, unknown> | undefined;
  const trace = obs?.trace as Record<string, unknown> | undefined;
  const exec = trace?.execution_trace_v1 as { snapshot_id?: unknown } | undefined;
  const id = exec?.snapshot_id;
  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : undefined;
}

/**
 * 当前 tick 已 hydrate 的 memory snapshot 与缓存答案的 execution_trace 锚不一致时，
 * 禁止 dedup：否则 attachObservability 会写入新 binding，出口合同抛 MEMORY_BINDING_MISMATCH → 500。
 * （legacy / cid-aware 均适用——这是硬锚一致性，不是兼容性放宽项。）
 */
export function shouldRejectDedupForMemorySnapshotMismatch(
  request: RouteAndRunRequestDto,
  cached: RouteAndRunResponseDto,
): boolean {
  if (request.options?.dry_run === true) {
    return false;
  }
  const status = cached.result?.status;
  if (
    status === 'NEED_MORE_INFO' ||
    status === 'NEED_CONSENT' ||
    status === 'NEED_CONFIRMATION' ||
    status === 'REDIRECT_REQUIRED' ||
    status === 'FAILED' ||
    status === 'TIMEOUT' ||
    status === 'PROCESSING'
  ) {
    // 出口合同对这些 status 跳过；不因 snapshot 挡 dedup
    return false;
  }
  const reqSnap = requestMemoryBindingSnapshotId(request);
  if (!reqSnap) {
    return false;
  }
  const cachedSnap = cachedExecutionTraceSnapshotId(cached);
  if (!cachedSnap) {
    // 成功路径缺 trace snapshot：交由 stale-trace / 出口合同处理；此处拒绝以免错配 500
    return true;
  }
  return reqSnap !== cachedSnap;
}

/**
 * `cid-aware`：若缓存成功响应缺少执行语义轴（或请求带 CID 但 trace 未物化 CID），拒绝 dedup，走新鲜执行以刷新 trace。
 * `legacy`：不据此拒绝（由调用方显式承担 enforcement 放宽后的观测语义）。
 */
export function shouldRejectDedupForStaleTraceContract(
  request: RouteAndRunRequestDto,
  cached: RouteAndRunResponseDto,
): boolean {
  if (resolveTraceCompatibilityMode(request) === 'legacy') {
    return false;
  }
  if (request.options?.dry_run === true) {
    return false;
  }
  const status = cached.result?.status;
  if (
    status === 'NEED_MORE_INFO' ||
    status === 'NEED_CONSENT' ||
    status === 'NEED_CONFIRMATION' ||
    status === 'REDIRECT_REQUIRED' ||
    status === 'FAILED' ||
    status === 'TIMEOUT'
  ) {
    return false;
  }
  const obs = cached.observability as Record<string, unknown> | undefined;
  const trace = obs?.trace as Record<string, unknown> | undefined;
  if (!trace?.execution_trace_v1) {
    return true;
  }
  const fp = trace.execution_semantic_fingerprint_v1;
  if (typeof fp !== 'string' || fp.length < 32) {
    return true;
  }
  if (request.options?.change_impact_descriptor_v1 != null && trace.change_impact_descriptor_v1 == null) {
    return true;
  }
  return false;
}
