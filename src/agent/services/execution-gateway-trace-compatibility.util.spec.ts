import {
  shouldRejectDedupForMemorySnapshotMismatch,
  shouldRejectDedupForStaleTraceContract,
} from './execution-gateway-trace-compatibility.util';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';

function req(partial: Record<string, unknown> = {}): RouteAndRunRequestDto {
  return {
    request_id: 'r1',
    user_id: 'u',
    trip_id: 't',
    message: 'm',
    options: {},
    ...partial,
  } as RouteAndRunRequestDto;
}

function okCached(traceSnap: string | null): RouteAndRunResponseDto {
  return {
    request_id: 'old',
    route: { route: 'SYSTEM1_RAG' },
    result: { status: 'OK', answer_text: '', payload: {} },
    explain: { decision_log: [] },
    observability: {
      latency_ms: 1,
      router_ms: 0,
      system_mode: 'SYSTEM1',
      tool_calls: 0,
      browser_steps: 0,
      tokens_est: 0,
      cost_est_usd: 0,
      fallback_used: false,
      trace:
        traceSnap == null
          ? {}
          : {
              execution_trace_v1: {
                schemaId: 'tripnara.orchestration_execution_trace@v1',
                version: 1,
                snapshot_id: traceSnap,
              },
              execution_semantic_fingerprint_v1: 'a'.repeat(32),
            },
    },
  } as RouteAndRunResponseDto;
}

describe('execution-gateway-trace-compatibility', () => {
  describe('shouldRejectDedupForMemorySnapshotMismatch', () => {
    it('当前 binding ≠ 缓存 trace snapshot → reject', () => {
      const request = req({
        __memoryExecutionBinding: { snapshot_id: 'snap-new', snapshot_version: 1 },
      });
      expect(shouldRejectDedupForMemorySnapshotMismatch(request, okCached('snap-old'))).toBe(true);
    });

    it('当前 binding = 缓存 trace snapshot → admit', () => {
      const request = req({
        __memoryExecutionBinding: { snapshot_id: 'snap-same', snapshot_version: 1 },
      });
      expect(shouldRejectDedupForMemorySnapshotMismatch(request, okCached('snap-same'))).toBe(
        false,
      );
    });

    it('成功路径缓存缺 snapshot → reject（避免出口 MEMORY_BINDING_MISMATCH）', () => {
      const request = req({
        __memoryExecutionBinding: { snapshot_id: 'snap-new', snapshot_version: 1 },
      });
      expect(shouldRejectDedupForMemorySnapshotMismatch(request, okCached(null))).toBe(true);
    });

    it('无 request binding → 不在此层拒绝', () => {
      expect(shouldRejectDedupForMemorySnapshotMismatch(req(), okCached('snap-old'))).toBe(false);
    });

    it('NEED_MORE_INFO → 不拒绝（出口合同跳过）', () => {
      const request = req({
        __memoryExecutionBinding: { snapshot_id: 'snap-new' },
      });
      const cached = {
        ...okCached('snap-old'),
        result: { status: 'NEED_MORE_INFO', answer_text: '', payload: {} },
      } as RouteAndRunResponseDto;
      expect(shouldRejectDedupForMemorySnapshotMismatch(request, cached)).toBe(false);
    });
  });

  describe('shouldRejectDedupForStaleTraceContract', () => {
    it('legacy 模式不因缺指纹拒绝', () => {
      const request = req({ options: { trace_compatibility_mode: 'legacy' } });
      expect(shouldRejectDedupForStaleTraceContract(request, okCached(null))).toBe(false);
    });
  });
});
