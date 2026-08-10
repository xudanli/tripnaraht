import {
  prepareSkillInput,
} from '../routing/prepare-skill-input.runner';
import type { PrepareSkillInputHost } from '../routing/prepare-skill-input.host';

describe('prepareSkillInput — emergency_constraints / planState bootstrap', () => {
  function makeHost(overrides: Partial<PrepareSkillInputHost> = {}): PrepareSkillInputHost {
    return {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      extractCountryCodeFromMessage: jest.fn(() => undefined),
      sanitizeOrchestrationHandoff: jest.fn((_req, value) => value),
      ...overrides,
    };
  }

  it('passes request.emergency_constraints into world.buildContext input', () => {
    const host = makeHost();
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

    const input = prepareSkillInput(host, step, results, context, request);
    expect(input.countryCode).toBe('IS');
    expect(input.emergency_constraints).toEqual(request.emergency_constraints);
  });

  it('bootstraps planState for plan.gate.precheck when absent', () => {
    const host = makeHost({
      extractCountryCodeFromMessage: jest.fn(() => 'IS'),
    });
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

    const input = prepareSkillInput(host, step, results, context, request);
    expect(input.planState).toBeDefined();
    expect(input.planState.constraints.time.days).toBe(7);
    expect(input.planState.itinerary.tripId).toBe('trip-iceland');
  });
});
