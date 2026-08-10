import {
  applyDecisionStatePatchLocal,
  projectToOrchestratorState,
  replaceDecisionStateInPlace,
} from './dso-authority.util';
import type { DecisionState } from './decision-state.types';
import type { OrchestratorState } from '../../agent/interfaces/trip-plan.interface';

function minimalDso(over: Partial<DecisionState> = {}): DecisionState {
  return {
    requestId: 'r1',
    userIntent: { destination: 'IS', gaps: [] },
    tripState: {},
    environmentState: {},
    systemState: {
      requestId: 'r1',
      currentPhase: 'GATE_EVAL',
      version: 3,
      startedAt: '2026-01-01T00:00:00.000Z',
      lastUpdatedAt: '2026-01-01T00:00:00.000Z',
    },
    constraints: {
      feasible: true,
      violations: [],
      feasibleActions: [],
    } as any,
    ...over,
  } as DecisionState;
}

describe('dso-authority.util', () => {
  it('projectToOrchestratorState assigns gate_result from DSO and stamps metadata', () => {
    const dso = minimalDso();
    const state = {
      request_id: 'r1',
      current_step: 'INTAKE',
      decision_log: [{ step: 'INTAKE' }],
      metadata: { started_at: '2026-01-01T00:00:00.000Z' },
    } as unknown as OrchestratorState;

    projectToOrchestratorState(dso, state, { phase: 'GATE_EVAL' });

    expect(state.gate_result).toBeDefined();
    expect(state.decision_log).toHaveLength(1);
    expect((state.metadata as any).dso_projection).toMatchObject({
      authority: 'DSO',
      dsoVersion: 3,
      phase: 'GATE_EVAL',
    });
  });

  it('applyDecisionStatePatchLocal updates constraints without bumping version', () => {
    const dso = minimalDso();
    applyDecisionStatePatchLocal(dso, {
      constraints: { violations: [], gate_result: 'ALLOW' } as any,
    });
    expect(dso.constraints?.violations).toEqual([]);
    expect(dso.systemState?.version).toBe(3);
    expect(dso.systemState?.lastUpdatedAt).toBeTruthy();
  });

  it('replaceDecisionStateInPlace keeps object identity', () => {
    const target = minimalDso();
    const source = minimalDso({
      systemState: {
        ...target.systemState!,
        version: 9,
        lastUpdatedAt: '2026-02-01T00:00:00.000Z',
        requestId: 'r1',
        currentPhase: 'PLAN_GEN',
        startedAt: target.systemState!.startedAt,
      },
    });
    const same = replaceDecisionStateInPlace(target, source);
    expect(same).toBe(target);
    expect(target.systemState?.version).toBe(9);
  });
});
