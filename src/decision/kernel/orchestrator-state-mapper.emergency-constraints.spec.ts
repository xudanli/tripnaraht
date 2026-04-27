import { orchestratorStateToDecisionStatePatch } from './orchestrator-state-mapper';

describe('orchestrator-state-mapper (emergency_constraints)', () => {
  it('projects OrchestratorState.metadata.emergency_constraints into systemState.emergency_constraints', () => {
    const patch = orchestratorStateToDecisionStatePatch({
      request_id: 'req-1',
      current_step: 'INTAKE',
      decision_log: [],
      decision_steps: [],
      evidence_registry: new Map(),
      errors: [],
      metadata: {
        started_at: '2026-01-01T00:00:00.000Z',
        last_updated_at: '2026-01-01T00:00:00.000Z',
        emergency_constraints: {
          forbidden_modes: ['DRIVE'],
          preferred_modes: ['RAIL'],
          max_wind_speed_tolerance_mps: 18,
          reason_code: 'HEALING_DRIVE_SAFETY_FAILED',
        },
      },
    } as any);

    expect(patch.systemState?.emergency_constraints).toBeTruthy();
    expect(patch.systemState?.emergency_constraints?.forbidden_modes).toEqual(expect.arrayContaining(['DRIVE']));
    expect(patch.systemState?.emergency_constraints?.preferred_modes).toEqual(expect.arrayContaining(['RAIL']));
    expect(patch.systemState?.emergency_constraints?.max_wind_speed_tolerance_mps).toBe(18);
    expect(patch.systemState?.emergency_constraints?.reason_code).toBe('HEALING_DRIVE_SAFETY_FAILED');
  });
});

