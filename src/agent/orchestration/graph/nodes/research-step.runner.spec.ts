import {
  collectWorldModelData,
  executeResearchStep,
} from './research-step.runner';
import type { ResearchStepHost } from './research-step.host';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';

describe('research-step.runner', () => {
  function makeHost(overrides: Partial<ResearchStepHost> = {}): ResearchStepHost {
    return {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      contextSlidingWindow: { slice: (_k, m) => m },
      generateDecisionStepForStep: jest.fn(async () => undefined),
      ...overrides,
    };
  }

  it('executeResearchStep sets research_data and logs decision', async () => {
    const host = makeHost();
    const state = {
      request_id: 'r1',
      decision_log: [],
      metadata: {},
      trip_plan_request: null,
    } as unknown as OrchestratorState;
    const request = { request_id: 'r1' } as RouteAndRunRequestDto;
    const context = {} as AgentContext;
    await executeResearchStep(host, request, context, state, 'openai' as any);
    expect(state.current_step).toBe('RESEARCH');
    expect(state.research_data).toEqual({});
    expect(state.decision_log.length).toBeGreaterThan(0);
    expect(host.generateDecisionStepForStep).toHaveBeenCalled();
  });

  it('collectWorldModelData no-ops without agents', async () => {
    const host = makeHost();
    const researchData: Record<string, any> = {};
    const evidenceRefs: string[] = [];
    await collectWorldModelData(
      host,
      { destination: 'IS' } as any,
      researchData,
      evidenceRefs,
    );
    expect(researchData).toEqual({});
    expect(evidenceRefs).toEqual([]);
  });
});
