import {
  evaluateDecisionAutomation,
  type DecisionAutomationEvaluationInput,
} from './decision-automation-policy.util';

describe('decision-automation-policy.util', () => {
  const autoExecutePolicy = {
    defaultLevel: 'AUTO_EXECUTE_CONDITIONAL' as const,
    autoAllowed: ['weather_hazard_replan', 'refresh_road_weather_evidence'],
    confirmationRequired: ['change_lodging', 'change_intercity_route'],
  };

  it('allows low-risk weather when AUTO_EXECUTE_CONDITIONAL', () => {
    const result = evaluateDecisionAutomation({
      automation: autoExecutePolicy,
      semanticKey: 'WEATHER_ACTIVITY_PROHIBITED:evt_1',
      semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
    });
    expect(result.outcome).toBe('ALLOW');
    expect(result.autoApplyEligible).toBe(true);
  });

  it('asks for road closure even under AUTO_EXECUTE', () => {
    const result = evaluateDecisionAutomation({
      automation: autoExecutePolicy,
      semanticKey: 'ROAD_SEGMENT_UNAVAILABLE:evt_1',
      semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
      enforcement: 'BLOCK',
    });
    expect(result.outcome).toBe('ASK');
    expect(result.autoApplyEligible).toBe(false);
    expect(result.reasonCodes).toContain('ACTION_TIER_ASK');
  });

  it('respects automationPaused', () => {
    const result = evaluateDecisionAutomation({
      automation: autoExecutePolicy,
      automationPaused: true,
      semanticKey: 'WEATHER_ACTIVITY_PROHIBITED:evt_1',
    });
    expect(result.outcome).toBe('ASK');
    expect(result.reasonCodes).toContain('AUTOMATION_PAUSED');
  });

  it('SUGGEST level never auto-applies', () => {
    const result = evaluateDecisionAutomation({
      automation: {
        defaultLevel: 'SUGGEST',
        autoAllowed: ['weather_hazard_replan'],
        confirmationRequired: [],
      },
      semanticKey: 'WEATHER_ACTIVITY_PROHIBITED:evt_1',
    });
    expect(result.outcome).toBe('ASK');
    expect(result.matchedActionKeys?.length).toBeGreaterThan(0);
  });

  it('returns DENY for payment actions', () => {
    const result = evaluateDecisionAutomation({
      automation: autoExecutePolicy,
      semanticKey: 'auto_payment:booking_1',
    });
    expect(result.outcome).toBe('DENY');
    expect(result.autoApplyEligible).toBe(false);
  });
});
