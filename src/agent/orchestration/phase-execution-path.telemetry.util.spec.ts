import {
  buildPhaseExecutionPathV1,
  emitPhaseExecutionPath,
  pathKindToSystemAction,
  PHASE_EXECUTION_PATH_SCHEMA_ID,
} from './phase-execution-path.telemetry.util';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('phase-execution-path.telemetry.util', () => {
  it('builds schema envelope', () => {
    const r = buildPhaseExecutionPathV1({
      phase: 'PLAN_GEN',
      path: 'legacy_callback',
      reason: 'flag_off',
    });
    expect(r.schemaId).toBe(PHASE_EXECUTION_PATH_SCHEMA_ID);
    expect(r.path).toBe('legacy_callback');
  });

  it('maps path kinds to system_action', () => {
    expect(pathKindToSystemAction('kernel_native')).toBe('KERNEL_NATIVE');
    expect(pathKindToSystemAction('legacy_callback')).toBe('KERNEL_LEGACY_FALLBACK');
    expect(pathKindToSystemAction('narrator_agent')).toBe('NARRATOR_AGENT_FALLBACK');
  });

  it('emitPhaseExecutionPath appends decision_log and metadata (no silent fallback)', () => {
    const warns: string[] = [];
    const state = {
      request_id: 'req-1',
      decision_log: [],
      metadata: {},
    } as unknown as OrchestratorState;

    emitPhaseExecutionPath(state, {
      phase: 'RESEARCH',
      path: 'legacy_callback',
      reason: 'flag_off',
      step: 'RESEARCH',
      loggerWarn: (m) => warns.push(m),
    });

    expect(warns.length).toBe(1);
    expect(state.decision_log).toHaveLength(1);
    expect(state.decision_log[0].metadata?.system_action).toBe('KERNEL_LEGACY_FALLBACK');
    const meta = state.metadata as Record<string, unknown>;
    expect(Array.isArray(meta.phase_execution_paths_v1)).toBe(true);
    expect((meta.last_phase_execution_path_v1 as { path: string }).path).toBe('legacy_callback');
  });
});
