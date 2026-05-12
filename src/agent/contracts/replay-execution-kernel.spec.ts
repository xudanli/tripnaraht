// src/agent/contracts/replay-execution-kernel.spec.ts
import { buildOrchestrationExecutionTraceV1 } from './orchestration-execution-trace-v1.types';
import { ReplayExecutionKernel } from './replay-execution-kernel';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { RouteAndRunResponseDto } from '../dto/route-and-run.dto';

describe('ReplayExecutionKernel', () => {
  const trace = buildOrchestrationExecutionTraceV1({
    snapshotId: 'snap-kernel-1',
    modelFingerprint: 'c'.repeat(64),
    selectedExecutionModelVersion: 'v1',
    selectionReason: 'exact_match',
    runtimeHint: null,
    route: {
      task_type: 'GENERIC_QA',
      route_policy_resolved: 'LEGACY',
      intent_mode_resolved: 'GENERIC_QA',
    },
  });

  it('replayFromTrace returns deterministic success when deps succeed', async () => {
    const kernel = new ReplayExecutionKernel({
      loadBaseRequestForReplay: async (_id) =>
        ({
          request_id: 'req-replay-1',
          message: 'm',
          trip_id: 't1',
          options: { max_seconds: 10 },
        }) as RouteAndRunRequestDto,
      executeReplay: async (req) =>
        ({
          request_id: req.request_id,
          route: {} as RouteAndRunResponseDto['route'],
          result: { status: 'OK', answer_text: '', payload: {} as RouteAndRunResponseDto['result']['payload'] },
        }) as RouteAndRunResponseDto,
    });
    const r = await kernel.replayFromTrace(trace);
    expect(r.deterministic).toBe(true);
    if (r.deterministic) {
      expect(r.snapshot_id).toBe('snap-kernel-1');
      expect(r.model_version).toBe('v1');
      expect(r.execution_outcome.result_status).toBe('OK');
      expect(r.selected_route.route_policy_resolved).toBe('LEGACY');
    }
  });

  it('replayFromTrace fails deterministic when snapshot missing', async () => {
    const kernel = new ReplayExecutionKernel({
      loadBaseRequestForReplay: async () => null,
      executeReplay: async () => {
        throw new Error('should not run');
      },
    });
    const r = await kernel.replayFromTrace(trace);
    expect(r.deterministic).toBe(false);
    if (!r.deterministic) {
      expect(r.failure_reason).toBe('snapshot_not_found');
    }
  });
});
