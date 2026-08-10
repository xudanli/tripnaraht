import { createOrchestrateEntryHost } from './orchestrate-entry-host.factory';

describe('orchestrate-entry-host.factory', () => {
  it('wires entry callbacks to service methods', async () => {
    const svc = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
      orchestrateItineraryDayViewQuery: jest.fn(async () => ({ ok: 'day' })),
      orchestrateWorkbenchAssistantPlaceholder: jest.fn(async () => ({ ok: 'wb' })),
      orchestrateLightweightKnowledgeQuery: jest.fn(async () => ({ ok: 'lw' })),
      orchestrateTeamStructuredDiscussionBypass: jest.fn(async () => ({ ok: 'team' })),
      orchestrateWithStateMachine: jest.fn(async () => ({ ok: 'sm' })),
    };
    const host = createOrchestrateEntryHost(svc as any);
    await host.runItineraryDayView({} as any, {} as any, 1);
    await host.runPlanningStateMachine({} as any, {} as any, { remainingMs: () => 1, clamp: (n) => n });
    expect(svc.orchestrateItineraryDayViewQuery).toHaveBeenCalled();
    expect(svc.orchestrateWithStateMachine).toHaveBeenCalled();
  });
});
