import {
  mapAbuGateToExistenceStatus,
  mapDecisionActionToGuardianAction,
  mapFatigueToDreCostStatus,
  mapPersonaVerdictToGuardianAction,
} from './guardian-action.types';

describe('guardian-action.types', () => {
  it('maps persona verdicts to guardian actions', () => {
    expect(mapPersonaVerdictToGuardianAction('ABU', 'REJECT')).toBe('BLOCK');
    expect(mapPersonaVerdictToGuardianAction('DR_DRE', 'ADJUST')).toBe('ADJUST');
    expect(mapPersonaVerdictToGuardianAction('NEPTUNE', 'REPLACE')).toBe('REPAIR');
    expect(mapPersonaVerdictToGuardianAction('ABU', 'NEED_CONFIRM')).toBe('CHOOSE');
    expect(mapPersonaVerdictToGuardianAction('ABU', 'ALLOW')).toBeNull();
  });

  it('maps decision pipeline actions', () => {
    expect(mapDecisionActionToGuardianAction('ABU', 'REJECT')).toBe('BLOCK');
    expect(mapDecisionActionToGuardianAction('NEPTUNE', 'REPLACE')).toBe('REPAIR');
  });

  it('maps gate status to Abu existence', () => {
    expect(mapAbuGateToExistenceStatus('REJECT', false)).toBe('BLOCK');
    expect(mapAbuGateToExistenceStatus('NEED_CONFIRM', false)).toBe('REQUIRE_CONFIRMATION');
    expect(mapAbuGateToExistenceStatus('ALLOW', false)).toBe('PASS');
  });

  it('maps fatigue to Dre cost status', () => {
    expect(mapFatigueToDreCostStatus(90)).toBe('OVERLOADED');
    expect(mapFatigueToDreCostStatus(40)).toBe('COMFORTABLE');
  });
});
