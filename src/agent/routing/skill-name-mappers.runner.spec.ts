import { mapSkillNameToStep, mapSkillNameToSubAgent } from './skill-name-mappers.runner';

describe('skill-name-mappers.runner', () => {
  it('maps gate/plan/repair skills', () => {
    expect(mapSkillNameToStep('policy.resolve')).toBe('GATE_EVAL');
    expect(mapSkillNameToStep('itinerary.generate')).toBe('PLAN_GEN');
    expect(mapSkillNameToStep('itinerary.smart_update')).toBe('REPAIR');
    expect(mapSkillNameToStep(undefined)).toBe('INTAKE');
  });

  it('maps sub-agents', () => {
    expect(mapSkillNameToSubAgent('gate.foo')).toBe('Gatekeeper');
    expect(mapSkillNameToSubAgent('narrate.day')).toBe('Narrator');
    expect(mapSkillNameToSubAgent(undefined)).toBe('Planner');
  });
});
