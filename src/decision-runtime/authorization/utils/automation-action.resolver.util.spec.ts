import { resolveEffectiveAutomationTier } from './automation-action.resolver.util';

describe('automation-action.resolver.util', () => {
  const basePolicy = {
    defaultLevel: 'AUTO_EXECUTE_CONDITIONAL' as const,
    autoAllowed: ['weather_hazard_replan', 'refresh_road_weather_evidence'],
    confirmationRequired: ['change_lodging', 'change_intercity_route'],
  };

  it('defaults weather replan to AUTO tier', () => {
    const result = resolveEffectiveAutomationTier({
      automation: basePolicy,
      semanticKey: 'WEATHER_ACTIVITY_PROHIBITED:evt_1',
      semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
    });
    expect(result.tier).toBe('AUTO');
    expect(result.reasonCodes).toContain('CATALOG_MATCH');
  });

  it('requires ASK for road BLOCK enforcement', () => {
    const result = resolveEffectiveAutomationTier({
      automation: basePolicy,
      semanticKey: 'ROAD_SEGMENT_UNAVAILABLE:evt_1',
      semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
      enforcement: 'BLOCK',
    });
    expect(result.tier).toBe('ASK');
    expect(result.reasonCodes).toContain('BLOCK_ENFORCEMENT_REQUIRES_CONFIRM');
  });

  it('honors user actionOverrides', () => {
    const result = resolveEffectiveAutomationTier({
      automation: {
        ...basePolicy,
        actionOverrides: { 'activity.trim_optional_items': 'AUTO' },
      },
      semanticKey: 'remove_poi:optional_1',
    });
    expect(result.tier).toBe('AUTO');
    expect(result.reasonCodes).toContain('USER_ACTION_OVERRIDE');
  });

  it('cannot override DENY floor to AUTO', () => {
    const result = resolveEffectiveAutomationTier({
      automation: {
        ...basePolicy,
        actionOverrides: { 'booking.payment': 'AUTO' },
      },
      semanticKey: 'auto_payment:booking_1',
    });
    expect(result.tier).toBe('DENY');
  });

  it('falls back to legacy confirmationRequired list', () => {
    const result = resolveEffectiveAutomationTier({
      automation: basePolicy,
      semanticKey: 'change_lodging:hotel_1',
    });
    expect(result.tier).toBe('ASK');
  });
});
