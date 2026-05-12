import { ClaudeOrchestratorService } from './claude-orchestrator.service';

describe('ClaudeOrchestratorService — emergency_constraints pass-through', () => {
  it('prepareSkillInput passes request.emergency_constraints into world.buildContext input', () => {
    const svc: any = Object.create(ClaudeOrchestratorService.prototype);
    // Minimal stubs to satisfy prepareSkillInput internals.
    svc.replacePlaceholders = (x: any) => x;
    svc.extractCountryCodeFromMessage = () => undefined;
    svc.logger = { debug: jest.fn(), warn: jest.fn() };

    const step: any = {
      skillName: 'world.buildContext',
      input: { countryCode: 'IS' },
    };
    const results: any = {};
    const context: any = { tripId: 'trip-1', userId: 'u1', requestId: 'req-1' };
    const request: any = {
      request_id: 'req-1',
      user_id: 'u1',
      trip_id: 'trip-1',
      message: 'replan',
      emergency_constraints: {
        forbidden_segments: ['B'],
        forced_road_states: { B: 'CLOSED' },
        reason_code: 'HEALING_PHYSICAL_DRIFT',
      },
    };

    const input = svc.prepareSkillInput(step, results, context, request);
    expect(input.countryCode).toBe('IS');
    expect(input.emergency_constraints).toEqual(request.emergency_constraints);
  });

  it('prepareSkillInput bootstraps planState for plan.gate.precheck when absent', () => {
    const svc: any = Object.create(ClaudeOrchestratorService.prototype);
    svc.replacePlaceholders = (x: any) => x;
    svc.extractCountryCodeFromMessage = () => 'IS';
    svc.logger = { debug: jest.fn(), warn: jest.fn() };
    svc.skillValidationRequiresPlanState = ClaudeOrchestratorService.prototype['skillValidationRequiresPlanState'].bind(svc);
    svc.extractPlanStateFromStepResults = ClaudeOrchestratorService.prototype['extractPlanStateFromStepResults'].bind(svc);
    svc.buildBootstrapPlanState = ClaudeOrchestratorService.prototype['buildBootstrapPlanState'].bind(svc);
    svc.hasValue = ClaudeOrchestratorService.prototype['hasValue'].bind(svc);

    const step: any = {
      skillName: 'plan.gate.precheck',
      input: {},
    };
    const results: any = {};
    const context: any = { tripId: 'trip-iceland', userId: 'u1', requestId: 'req-1' };
    const request: any = {
      request_id: 'req-1',
      user_id: 'u1',
      trip_id: 'trip-iceland',
      message: '7天冰岛南岸路线是否可行？',
    };

    const input = svc.prepareSkillInput(step, results, context, request);
    expect(input.planState).toBeDefined();
    expect(input.planState.constraints.time.days).toBe(7);
    expect(input.planState.itinerary.tripId).toBe('trip-iceland');
  });
});

