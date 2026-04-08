/**
 * S-DK-02：GATE 前后 OrchestratorState ↔ DSO 迁移断言
 * 对齐 docs/decision/DSO_ORCHESTRATOR_STATE_MAPPING_BASELINE.md §8
 */

import type { DecisionState } from './decision-state.types';
import type { GateResult, OrchestratorState } from '../../agent/interfaces/trip-plan.interface';
import {
  buildPatchFromDSOPrimary,
  decisionStateToOrchestratorState,
  mergeUserIntentForDsoPrimaryPatch,
  orchestratorStateToDecisionStatePatch,
} from './orchestrator-state-mapper';

function baseOrchestrator(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    request_id: 'req-gate-mig',
    current_step: 'GATE_EVAL',
    trip_plan_request: {
      request_id: 'req-gate-mig',
      origin: '',
      destination: 'JP-Tokyo',
    },
    metadata: { started_at: '2026-03-28T00:00:00.000Z', last_updated_at: '2026-03-28T00:01:00.000Z' },
    ...overrides,
  } as OrchestratorState;
}

describe('orchestrator-state-mapper gate migration (S-DK-02)', () => {
  describe('mergeUserIntentForDsoPrimaryPatch (DSO 片段不得覆盖 O 的 destination)', () => {
    it('preserves orchestrator destination when DSO userIntent only has gaps', () => {
      const fromO = { destination: 'Reykjavik', mode: 'mixed' as const };
      const fromDso = {
        gaps: [{ type: 'MISSING_DESTINATION', severity: 'HARD' as const, detail: 'x' }],
      };
      const m = mergeUserIntentForDsoPrimaryPatch(fromO, fromDso);
      expect(m?.destination).toBe('Reykjavik');
      expect(m?.gaps).toHaveLength(1);
      expect(m?.mode).toBe('mixed');
    });
  });

  describe('OrchestratorState → DecisionStatePatch (pre/post GATE)', () => {
    it('maps current_step GATE_EVAL to systemState.currentPhase', () => {
      const os = baseOrchestrator({
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 1,
        },
      });
      const patch = orchestratorStateToDecisionStatePatch(os);
      expect(patch.systemState?.currentPhase).toBe('GATE_EVAL');
    });

    it('maps gate_result BLOCK to constraints.feasible false and violations', () => {
      const gate_result: GateResult = {
        gate_result: 'BLOCK',
        violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'no_route' }],
        required_adjustments: [],
        confidence: 0.9,
      };
      const os = baseOrchestrator({ gate_result });
      const patch = orchestratorStateToDecisionStatePatch(os);
      expect(patch.constraints?.feasible).toBe(false);
      expect(patch.constraints?.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'SAFETY', severity: 'HARD', detail: 'no_route' }),
        ]),
      );
    });

    it('maps required_adjustments to constraints.feasibleActions', () => {
      const gate_result: GateResult = {
        gate_result: 'ADJUST_REQUIRED',
        violations: [{ type: 'BUDGET', severity: 'SOFT', detail: 'over' }],
        required_adjustments: [{ action: 'REPLACE_POI', why: 'budget' }],
        confidence: 0.7,
      };
      const os = baseOrchestrator({ gate_result });
      const patch = orchestratorStateToDecisionStatePatch(os);
      expect(patch.constraints?.feasible).toBe(false);
      expect(patch.constraints?.feasibleActions).toEqual(['REPLACE_POI']);
    });
  });

  describe('DecisionState → OrchestratorState (phase + gate_result)', () => {
    const dsoBase = (constraints: DecisionState['constraints']): DecisionState =>
      ({
        requestId: 'req-d2o',
        systemState: {
          requestId: 'req-d2o',
          currentPhase: 'GATE_EVAL',
          startedAt: '2026-03-28T00:00:00.000Z',
          lastUpdatedAt: '2026-03-28T00:02:00.000Z',
          version: 0,
        },
        constraints,
      }) as DecisionState;

    it('maps systemState.currentPhase to current_step', () => {
      const dso = dsoBase({ feasible: true, violations: [] });
      const out = decisionStateToOrchestratorState(dso);
      expect(out.current_step).toBe('GATE_EVAL');
    });

    it('maps constraints ALLOW round-trip: feasible true → gate ALLOW', () => {
      const dso = dsoBase({ feasible: true, violations: [] });
      const out = decisionStateToOrchestratorState(dso);
      expect(out.gate_result?.gate_result).toBe('ALLOW');
    });

    it('maps constraints with HARD violation → gate BLOCK', () => {
      const dso = dsoBase({
        feasible: false,
        violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'x' }],
      });
      const out = decisionStateToOrchestratorState(dso);
      expect(out.gate_result?.gate_result).toBe('BLOCK');
      expect(out.gate_result?.violations?.[0]?.detail).toBe('x');
    });

    it('maps constraints soft-only infeasible → gate ADJUST_REQUIRED', () => {
      const dso = dsoBase({
        feasible: false,
        violations: [{ type: 'BUDGET', severity: 'SOFT', detail: 'over' }],
      });
      const out = decisionStateToOrchestratorState(dso);
      expect(out.gate_result?.gate_result).toBe('ADJUST_REQUIRED');
    });
  });

  describe('buildPatchFromDSOPrimary: currentPhase tracks orchestrator current_step (§4 评审点)', () => {
    it('overrides stale DSO currentPhase with os.current_step when merging', () => {
      const os = baseOrchestrator({ current_step: 'GATE_EVAL' });
      const dso = {
        requestId: 'req-merge',
        systemState: {
          requestId: 'req-merge',
          currentPhase: 'PLAN' as const,
          startedAt: '2026-03-28T00:00:00.000Z',
          lastUpdatedAt: '2026-03-28T00:00:00.000Z',
          version: 0,
        },
        constraints: { feasible: false, violations: [{ type: 'TIME', severity: 'SOFT', detail: 'tight' }] },
      } as DecisionState;

      const patch = buildPatchFromDSOPrimary(dso, os);
      expect(patch.systemState?.currentPhase).toBe('GATE_EVAL');
      expect(patch.constraints?.feasible).toBe(false);
    });
  });

  describe('G-01: NEED_USER_CONFIRM preserved through O→D→O (gateOutcome)', () => {
    it('O→D then D→O keeps NEED_USER_CONFIRM when no HARD violations', () => {
      const gate_result: GateResult = {
        gate_result: 'NEED_USER_CONFIRM',
        violations: [],
        required_adjustments: [],
        confidence: 0.85,
      };
      const os = baseOrchestrator({ gate_result });
      const patch = orchestratorStateToDecisionStatePatch(os);
      const dso = {
        requestId: os.request_id,
        systemState: {
          requestId: os.request_id!,
          currentPhase: 'GATE_EVAL' as const,
          startedAt: os.metadata?.started_at,
          lastUpdatedAt: os.metadata?.last_updated_at,
          version: 0,
        },
        constraints: patch.constraints,
      } as DecisionState;
      const out = decisionStateToOrchestratorState(dso);
      expect(out.gate_result?.gate_result).toBe('NEED_USER_CONFIRM');
    });
  });

  describe('DSO tripState.orchestratorAlternatives → OrchestratorState.alternatives (T3)', () => {
    it('maps Kernel BLOCK 持久化字段到兼容层', () => {
      const alts = {
        alternative_pois: [{ poi_id: 'x', name: 'N', reason: 'R', evidence_status: 'UNVERIFIED' }],
        alternative_routes: [],
      };
      const dso = {
        requestId: 'r1',
        systemState: { requestId: 'r1', currentPhase: 'GATE_EVAL' },
        tripState: { orchestratorAlternatives: alts },
        userIntent: {},
        environmentState: {},
      } as DecisionState;
      const out = decisionStateToOrchestratorState(dso);
      expect(out.alternatives?.alternative_pois).toHaveLength(1);
    });
  });
});
