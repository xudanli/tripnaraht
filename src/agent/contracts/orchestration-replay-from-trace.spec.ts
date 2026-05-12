// src/agent/contracts/orchestration-replay-from-trace.spec.ts
import { buildOrchestrationExecutionTraceV1 } from './orchestration-execution-trace-v1.types';
import {
  buildReplayFromTrace,
  mergeReplayProfileIntoRouteAndRunRequest,
  replayExecutionFromTrace,
} from './orchestration-replay-from-trace';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('orchestration-replay-from-trace', () => {
  const trace = buildOrchestrationExecutionTraceV1({
    snapshotId: 'snap-replay-1',
    modelFingerprint: 'f'.repeat(64),
    selectedExecutionModelVersion: 'v1',
    selectionReason: 'exact_match',
    runtimeHint: 'hint-a',
    route: {
      task_type: 'GENERIC_QA',
      route_policy_resolved: 'CLAUDE_SM',
      intent_mode_requested: 'AUTO',
      intent_mode_resolved: 'GENERIC_QA',
    },
  });

  it('buildReplayFromTrace maps routing + execution model overlay', () => {
    const p = buildReplayFromTrace(trace);
    expect(p.snapshot_id).toBe('snap-replay-1');
    expect(p.options_overlay.use_claude_orchestration).toBe(true);
    expect(p.options_overlay.use_state_machine_orchestration).toBe(true);
    expect(p.options_overlay.intent_mode).toBe('GENERIC_QA');
    expect(p.options_overlay.execution_model_version).toBe('v1');
    expect(p.options_overlay.execution_model_allow_upgrade).toBe(false);
    expect(p.options_overlay.execution_model_runtime_hint).toBe('hint-a');
  });

  it('mergeReplayProfileIntoRouteAndRunRequest shallow-merges options', () => {
    const base = {
      request_id: 'r1',
      message: 'hi',
      trip_id: 't1',
      options: { max_seconds: 42, dry_run: true },
    } as RouteAndRunRequestDto;
    const merged = mergeReplayProfileIntoRouteAndRunRequest(base, buildReplayFromTrace(trace));
    expect(merged.options?.max_seconds).toBe(42);
    expect(merged.options?.dry_run).toBe(true);
    expect(merged.options?.intent_mode).toBe('GENERIC_QA');
    expect(merged.options?.use_claude_orchestration).toBe(true);
  });

  it('replayExecutionFromTrace delegates to runner with merged request', async () => {
    const base = { request_id: 'r1', message: 'm', trip_id: 't1' } as RouteAndRunRequestDto;
    const out = await replayExecutionFromTrace(base, trace, async (req) => ({
      ok: true,
      intent_mode: req.options?.intent_mode,
    }));
    expect(out).toEqual({ ok: true, intent_mode: 'GENERIC_QA' });
  });
});
