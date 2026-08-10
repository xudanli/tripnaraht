import {
  extractDaysFromMessageForPlanBootstrap,
  mergeSkillOutputWithPlanStateInput,
  prepareSkillInput,
  skillValidationRequiresPlanState,
} from './prepare-skill-input.runner';
import type { PrepareSkillInputHost } from './prepare-skill-input.host';

describe('prepare-skill-input.runner', () => {
  it('extractDaysFromMessageForPlanBootstrap parses chinese days', () => {
    expect(extractDaysFromMessageForPlanBootstrap('想去玩5天')).toBe(5);
    expect(extractDaysFromMessageForPlanBootstrap('三日游')).toBe(3);
  });

  it('skillValidationRequiresPlanState detects planState dependency', () => {
    expect(skillValidationRequiresPlanState('plan.gate.precheck')).toBe(true);
    expect(skillValidationRequiresPlanState('web.browse')).toBe(false);
  });

  it('mergeSkillOutputWithPlanStateInput fills missing planState', () => {
    const planState = { plan_id: 'p1' } as any;
    const out = mergeSkillOutputWithPlanStateInput(
      { planState },
      { ok: true },
    );
    expect(out.planState).toBe(planState);
    expect(out.ok).toBe(true);
  });

  it('prepareSkillInput injects tripId from context', () => {
    const host: PrepareSkillInputHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      extractCountryCodeFromMessage: () => undefined,
      sanitizeOrchestrationHandoff: (_r, v) => v,
    };
    const out = prepareSkillInput(
      host,
      { id: 's1', type: 'skill', skillName: 'intent.recognize', input: {}, dependencies: [], parallel: false },
      {},
      { tripId: 't1', userId: 'u1', requestId: 'r1' } as any,
      { trip_id: 't1', user_id: 'u1', request_id: 'r1', message: 'hi' } as any,
    );
    expect(out.tripId).toBe('t1');
  });
});
