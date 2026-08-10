import { applyResearchScopeInvalidationCowBeforeResearch } from './research-scope-invalidation-cow.runner';
import type { ResearchScopeInvalidationCowHost } from './research-scope-invalidation-cow.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('research-scope-invalidation-cow.runner', () => {
  it('no-ops when scope plan has empty assetScopes', async () => {
    const host: ResearchScopeInvalidationCowHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      resolveDosExecutionContext: () => undefined,
    };
    const state = {
      request_id: 'r1',
      decision_log: [],
      metadata: {},
      research_data: { pois: [{ id: 1 }] },
    } as unknown as OrchestratorState;
    const request = { request_id: 'r1', message: 'hello' } as RouteAndRunRequestDto;
    await applyResearchScopeInvalidationCowBeforeResearch(host, request, state);
    expect(state.decision_log).toHaveLength(0);
  });
});
