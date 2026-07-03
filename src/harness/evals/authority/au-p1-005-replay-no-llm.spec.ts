import { getAuthorityCase } from '../authority/authority-cases.registry';
import {
  authorityAssert,
  expectAuthorityPass,
  runAuthorityCase,
} from '../assertions/canonical-authority.assertions';
import {
  buildReplayProfileFromTrace,
  mergeReplayProfileIntoRouteAndRunRequest,
} from '../../../agent/contracts/orchestration-replay-from-trace';
import type { OrchestrationExecutionTraceV1 } from '../../../agent/contracts/orchestration-execution-trace-v1.types';
import { replayFromTrace } from '../../../agent/contracts/replay-execution-kernel';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../../../agent/dto/route-and-run.dto';
import {
  assertFreshLlmCallAllowedUnderReplayStrictSeal,
  evaluateReplayStrictSealPolicy,
  ReplayStrictSealViolation,
  runWithReplayStrictSealContext,
  sealReplayRouteAndRunRequest,
} from '../../../agent/runtime/replay-strict-seal.util';

function sampleTrace(): OrchestrationExecutionTraceV1 {
  return {
    schemaId: 'agent.orchestration.execution_trace@v1',
    version: 1,
    snapshot_id: 'snap_replay_1',
    model_fingerprint: 'fp_test',
    selected_execution_model_version: 'v1',
    selection_reason: 'test',
    runtime_hint: null,
    route_decision_path: {
      task_type: 'TRIP_PLANNING',
      route_policy_resolved: 'CLAUDE_SM',
      intent_mode_requested: 'AUTO',
      intent_mode_resolved: 'TRIP_PLANNING',
    },
  };
}

function buildSealedReplayRequest(trace = sampleTrace()): RouteAndRunRequestDto {
  const base = {
    request_id: 'req_replay',
    user_id: 'u1',
    message: '(replay)',
    options: {},
  } as RouteAndRunRequestDto;
  const merged = mergeReplayProfileIntoRouteAndRunRequest(
    base,
    buildReplayProfileFromTrace(trace),
  );
  return sealReplayRouteAndRunRequest(merged, trace.snapshot_id);
}

/**
 * AU-P1-005 — Replay strict seal must prevent mode fallback and context enricher drift.
 */
describe('AU-P1-005 — Replay must not re-invoke LLM', () => {
  const caseDef = getAuthorityCase('AU-P1-005')!;

  it('replay_from_trace sets orchestration_replay_strict_seal on merged request', () => {
    const trace = sampleTrace();
    const sealed = buildSealedReplayRequest(trace);
    expect(sealed.options?.orchestration_replay_strict_seal).toBe(true);
    expect(sealed.options?.execution_model_allow_upgrade).toBe(false);
    expect(sealed.options?.orchestration_replay_anchor_snapshot_id).toBe('snap_replay_1');
  });

  it('strict seal policy disables enricher / DOS compile / mode fallback drift', () => {
    const sealed = buildSealedReplayRequest();
    const policy = evaluateReplayStrictSealPolicy(sealed);
    expect(policy.sealed).toBe(true);
    expect(policy.suppressesFreshLlmCalls).toBe(true);
    expect(policy.disablesRouteContextEnricher).toBe(true);
    expect(policy.disablesDosIntentCompile).toBe(true);
    expect(policy.forbidsModeFallback).toBe(true);
  });

  it('fresh LLM calls are blocked under replay strict seal context', () => {
    let violation: ReplayStrictSealViolation | undefined;
    runWithReplayStrictSealContext(
      { active: true, requestId: 'req_replay', anchorSnapshotId: 'snap_replay_1' },
      () => {
        try {
          assertFreshLlmCallAllowedUnderReplayStrictSeal();
        } catch (e) {
          violation = e as ReplayStrictSealViolation;
        }
      },
    );
    expect(violation?.code).toBe('REPLAY_STRICT_SEAL_LLM_BLOCKED');
  });

  it('ReplayExecutionKernel sealed replay succeeds without invoking fresh LLM', async () => {
    const trace = sampleTrace();
    const sealed = buildSealedReplayRequest(trace);

    const mockResponse: RouteAndRunResponseDto = {
      request_id: sealed.request_id,
      route: { route: 'SYSTEM1_RAG', confidence: 1, reasons: [] },
      result: { status: 'OK', answer_text: 'replay', payload: {} },
      explain: { decision_log: [] },
      observability: { fallback_used: false },
    };

    const result = await replayFromTrace(trace, {
      loadBaseRequestForReplay: async () => sealed,
      executeReplay: async (request) =>
        runWithReplayStrictSealContext(
          {
            active: true,
            requestId: request.request_id,
            anchorSnapshotId: trace.snapshot_id,
          },
          async () => mockResponse,
        ),
    });

    expect(result.deterministic).toBe(true);
    if (result.deterministic) {
      expect(result.execution_outcome.result_status).toBe('OK');
    }
  });

  it(caseDef.description, async () => {
    const sealed = buildSealedReplayRequest();
    const policy = evaluateReplayStrictSealPolicy(sealed);

    let llmGuardBlocksFreshCalls = false;
    runWithReplayStrictSealContext(
      {
        active: true,
        requestId: sealed.request_id,
        anchorSnapshotId: sealed.options?.orchestration_replay_anchor_snapshot_id,
      },
      () => {
        try {
          assertFreshLlmCallAllowedUnderReplayStrictSeal();
        } catch (e) {
          llmGuardBlocksFreshCalls = e instanceof ReplayStrictSealViolation;
        }
      },
    );

    const result = await runAuthorityCase({
      caseId: caseDef.caseId,
      run: async () => [
        authorityAssert({
          layer: 'memory_snapshot',
          name: 'replay_strict_seal_complete',
          pass: policy.sealed,
          expected: true,
          actual: policy.sealed,
        }),
        authorityAssert({
          layer: 'memory_snapshot',
          name: 'replay_uses_frozen_memory_not_fresh_llm',
          pass: policy.suppressesFreshLlmCalls && llmGuardBlocksFreshCalls,
          expected: true,
          actual: { policy, llmGuardBlocksFreshCalls },
          message:
            'replay_from_trace with strict seal must block fresh LLM provider calls via runtime guard',
        }),
        authorityAssert({
          layer: 'memory_snapshot',
          name: 'replay_disables_context_enricher_drift',
          pass: policy.disablesRouteContextEnricher && policy.disablesDosIntentCompile,
          expected: true,
          actual: policy,
        }),
      ],
    });

    expectAuthorityPass(result);
  });
});
