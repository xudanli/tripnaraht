import { mergeStoredTravelDecisionContract } from './travel-decision-contract.builder';

describe('mergeStoredTravelDecisionContract automation extensions', () => {
  it('persists automationPaused and automationScope', () => {
    const merged = mergeStoredTravelDecisionContract(undefined, {
      automationPaused: true,
      automationScope: 'USER_TEMPLATE',
      automation: { defaultLevel: 'AUTO_REPAIR_LOW_RISK' },
    });

    expect(merged.automationPaused).toBe(true);
    expect(merged.automationScope).toBe('USER_TEMPLATE');
    expect(merged.automation?.defaultLevel).toBe('AUTO_REPAIR_LOW_RISK');
  });

  it('resetAutomationToDefaults clears overrides', () => {
    const merged = mergeStoredTravelDecisionContract(
      {
        automation: {
          defaultLevel: 'SUGGEST',
          autoAllowed: [],
          confirmationRequired: [],
          actionOverrides: { 'activity.trim_optional_items': 'AUTO' },
          executionConditions: { 'time_route.update_eta': { noCrossDay: true } },
        },
      },
      {
        resetAutomationToDefaults: true,
        automation: { defaultLevel: 'SUGGEST' },
      },
    );

    expect(merged.automation?.actionOverrides).toEqual({});
    expect(merged.automation?.executionConditions).toEqual({});
  });
});
