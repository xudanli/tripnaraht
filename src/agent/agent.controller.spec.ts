import { AgentController } from './agent.controller';
import { AgentService } from './services/agent.service';

describe('AgentController', () => {
  it('maps itinerary.action_plan into actionExecution with confirmation count', async () => {
    const mockService: Pick<AgentService, 'routeAndRun'> = {
      routeAndRun: jest.fn().mockResolvedValue({
        request_id: 'req-1',
        route: {} as any,
        result: {
          status: 'OK',
          answer_text: 'ok',
          payload: {
            timeline: [],
            dropped_items: [],
            candidates: [],
            evidence: [],
            robustness: null,
            orchestrationResult: {
              itinerary: {
                action_plan: [
                  {
                    action_id: 'a1',
                    action_type: 'BOOK',
                    target_type: 'FLIGHT',
                    requires_confirmation: true,
                    risk_level: 'HIGH',
                  },
                  {
                    action_id: 'a2',
                    action_type: 'NOTIFY',
                    target_type: 'ITINERARY',
                    requires_confirmation: false,
                    risk_level: 'LOW',
                  },
                ],
              },
            },
          },
        },
        explain: { decision_log: [] },
        observability: {} as any,
      }),
    };

    const controller = new AgentController(mockService as AgentService);
    const response = await controller.routeAndRun({
      request_id: 'req-1',
      user_id: 'u1',
      message: 'test',
      options: { execution_mode: 'SEMI_AUTO' },
    } as any);

    expect(response.result.payload.actionExecution).toBeDefined();
    expect(response.result.payload.actionExecution.pendingActions).toHaveLength(2);
    expect(response.result.payload.actionExecution.requires_confirmation_count).toBe(1);
  });

  it('fills travelOntologyState from orchestration state when service omitted it', async () => {
    const state = {
      request_id: 'req-1',
      current_step: 'DONE' as const,
      trip_plan_request: {
        request_id: 'req-1',
        origin: '',
        destination: 'Paris',
        ontology_context: { trip_id: 'T99', destination: { name: 'Paris' } },
      },
      itinerary: { request_id: 'req-1', days: [] },
      decision_log: [],
      evidence_registry: new Map(),
      errors: [],
      metadata: { started_at: new Date().toISOString(), last_updated_at: new Date().toISOString() },
    };
    const mockService: Pick<AgentService, 'routeAndRun'> = {
      routeAndRun: jest.fn().mockResolvedValue({
        request_id: 'req-1',
        route: {} as any,
        result: {
          status: 'OK',
          answer_text: 'ok',
          payload: {
            timeline: [],
            dropped_items: [],
            candidates: [],
            evidence: [],
            robustness: null,
            orchestrationResult: { state },
          },
        },
        explain: { decision_log: [] },
        observability: {} as any,
      }),
    };

    const controller = new AgentController(mockService as AgentService);
    const response = await controller.routeAndRun({
      request_id: 'req-1',
      user_id: 'u1',
      message: 'test',
    } as any);

    expect(response.result.payload.travelOntologyState?.tripId).toBe('T99');
    expect(response.result.payload.travelOntologyState?.nouns?.destination?.name).toBe('Paris');
  });
});
