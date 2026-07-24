import {
  assertFreshLlmCallAllowedUnderReplayStrictSeal,
  evaluateReplayStrictSealPolicy,
  isReplayStrictSealComplete,
  ReplayStrictSealViolation,
  runWithReplayStrictSealContext,
  sealReplayRouteAndRunRequest,
} from './replay-strict-seal.util';
import {
  buildReplayProfileFromTrace,
  mergeReplayProfileIntoRouteAndRunRequest,
} from '../contracts/orchestration-replay-from-trace';
import type { OrchestrationExecutionTraceV1 } from '../contracts/orchestration-execution-trace-v1.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

function sampleTrace(): OrchestrationExecutionTraceV1 {
  return {
    schemaId: 'agent.orchestration.execution_trace@v1',
    version: 1,
    snapshot_id: 'snap_replay_guard',
    model_fingerprint: 'fp_test',
    selected_execution_model_version: 'v1',
    selection_reason: 'test',
    runtime_hint: null,
    route_decision_path: {
      task_type: 'TRIP_PLANNING',
      route_policy_resolved: 'CLAUDE_SM',
    },
  };
}

describe('replay-strict-seal.util', () => {
  it('complete seal requires anchor + upgrade off', () => {
    const trace = sampleTrace();
    const base: RouteAndRunRequestDto = {
      request_id: 'req',
      user_id: 'u1',
      message: '(replay)',
      options: {},
    };
    const merged = mergeReplayProfileIntoRouteAndRunRequest(
      base,
      buildReplayProfileFromTrace(trace),
    );
    const sealed = sealReplayRouteAndRunRequest(merged, trace.snapshot_id);

    expect(isReplayStrictSealComplete(sealed)).toBe(true);
    expect(evaluateReplayStrictSealPolicy(sealed).suppressesFreshLlmCalls).toBe(true);
  });

  it('blocks fresh LLM calls when strict seal context is active', () => {
    let blocked = false;
    runWithReplayStrictSealContext({ active: true, requestId: 'req' }, () => {
      try {
        assertFreshLlmCallAllowedUnderReplayStrictSeal();
      } catch (e) {
        blocked = e instanceof ReplayStrictSealViolation;
      }
    });
    expect(blocked).toBe(true);
  });

  it('allows LLM calls when strict seal context is inactive', () => {
    expect(() => assertFreshLlmCallAllowedUnderReplayStrictSeal()).not.toThrow();
  });
});
