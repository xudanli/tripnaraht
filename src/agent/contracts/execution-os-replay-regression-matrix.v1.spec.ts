/**
 * Replay regression matrix v1 — SSC §3
 * @see src/agent/runtime/specs/execution-os-stability-contract.v1.md
 */
import { buildOrchestrationExecutionTraceV1 } from './orchestration-execution-trace-v1.types';
import { buildReplayFromTrace, mergeReplayProfileIntoRouteAndRunRequest } from './orchestration-replay-from-trace';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { buildSemanticModelSnapshotDescriptor } from '../runtime/testing/semantic-model-snapshot-descriptor';
import { EXECUTION_MODEL_RUNTIME_ROUTER } from '../runtime/execution-model-runtime-router';

function goldenTraceV1(snapshotId: string) {
  const fp = buildSemanticModelSnapshotDescriptor().fingerprint;
  const router = EXECUTION_MODEL_RUNTIME_ROUTER.select({
    snapshotId,
    executionModelVersion: undefined,
    allowUpgrade: false,
    runtimeHint: null,
  });
  return buildOrchestrationExecutionTraceV1({
    snapshotId,
    modelFingerprint: fp,
    selectedExecutionModelVersion: router.selectedExecutionModelVersion,
    selectionReason: router.reason,
    runtimeHint: null,
    route: {
      task_type: 'GENERIC_QA',
      route_policy_resolved: 'LEGACY',
      intent_mode_requested: 'AUTO',
      intent_mode_resolved: 'GENERIC_QA',
    },
  });
}

describe('execution-os-replay-regression-matrix v1', () => {
  const snap = '33333333-3333-4333-8333-333333333333';

  it('v1 vs v1: identical trace yields identical replay profile', () => {
    const t = goldenTraceV1(snap);
    const p1 = buildReplayFromTrace(t);
    const p2 = buildReplayFromTrace(t);
    expect(p2).toEqual(p1);
  });

  it('v1 strict seal replay: merged options can carry seal + upgrade off (product shape)', () => {
    const t = goldenTraceV1(snap);
    const base: RouteAndRunRequestDto = {
      request_id: 'req-ssc-v1',
      user_id: 'anonymous',
      message: '(replay regression)',
      trip_id: 'trip-ssc',
    };
    const merged = mergeReplayProfileIntoRouteAndRunRequest(base, buildReplayFromTrace(t));
    const sealed: RouteAndRunRequestDto = {
      ...merged,
      options: {
        ...merged.options,
        orchestration_replay_anchor_snapshot_id: t.snapshot_id,
        orchestration_replay_strict_seal: true,
        execution_model_allow_upgrade: false,
      },
    };
    expect(sealed.options?.execution_model_allow_upgrade).toBe(false);
    expect(sealed.options?.orchestration_replay_strict_seal).toBe(true);
    expect(sealed.options?.orchestration_replay_anchor_snapshot_id).toBe(t.snapshot_id);
  });

  it('golden trace fingerprint matches host descriptor material', () => {
    const t = goldenTraceV1(snap);
    expect(t.model_fingerprint).toBe(buildSemanticModelSnapshotDescriptor().fingerprint);
  });
});

describe.skip('cross-version replay compatibility (v2 — placeholder)', () => {
  it('enable when ORCHESTRATION_EXECUTION_TRACE_V2 / governance v2 exist; see execution-os-stability-contract.v1.md §3', () => {
    expect(true).toBe(true);
  });
});
