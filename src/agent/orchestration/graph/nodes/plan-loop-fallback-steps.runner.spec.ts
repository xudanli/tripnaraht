import {
  executePlanGenStep,
  executeRepairStep,
  executeVerifyStep,
} from './plan-loop-fallback-steps.runner';
import type { PlanLoopFallbackStepsHost } from './plan-loop-fallback-steps.host';
import { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';

describe('plan-loop-fallback-steps.runner', () => {
  function makeHost(overrides: Partial<PlanLoopFallbackStepsHost> = {}): PlanLoopFallbackStepsHost {
    return {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      generateDecisionStepForStep: jest.fn(async () => undefined),
      ...overrides,
    };
  }

  function makeState(partial: Partial<OrchestratorState> = {}): OrchestratorState {
    return {
      request_id: 'r1',
      current_step: 'INTAKE',
      decision_log: [],
      errors: [],
      evidence_registry: new Map(),
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      },
      ...partial,
    } as OrchestratorState;
  }

  const request = { request_id: 'r1', message: 'hi' } as RouteAndRunRequestDto;
  const context = { requestId: 'r1', userId: 'u1' } as AgentContext;

  it('executePlanGenStep falls back to empty itinerary without skills', async () => {
    const host = makeHost();
    const state = makeState({ trip_plan_request: { request_id: 'r1' } as any });
    await executePlanGenStep(host, request, context, state, LlmProvider.ANTHROPIC);
    expect(state.current_step).toBe('PLAN_GEN');
    expect(state.itinerary?.days).toEqual([]);
    expect(host.generateDecisionStepForStep).toHaveBeenCalledWith(state, 'PLAN_GEN', 'Planner');
  });

  it('executeVerifyStep records pass when no itinerary', async () => {
    const host = makeHost();
    const state = makeState();
    await executeVerifyStep(host, request, context, state, LlmProvider.ANTHROPIC);
    expect(state.current_step).toBe('VERIFY');
    expect(state.decision_log.some((e) => e.outputs_summary?.includes('验证通过'))).toBe(true);
  });

  it('executeRepairStep logs no-op when no agents/skills', async () => {
    const host = makeHost();
    const state = makeState({
      gate_result: {
        gate_result: 'ALLOW',
        violations: [],
        required_adjustments: [],
        confidence: 1,
        evidence_refs: [],
      },
    });
    await executeRepairStep(host, request, context, state, LlmProvider.ANTHROPIC);
    expect(state.current_step).toBe('REPAIR');
    expect(state.decision_log.some((e) => e.step === 'REPAIR')).toBe(true);
  });
});
