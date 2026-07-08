import {
  classifyCanonicalL2Phase,
  isCanonicalL2Problem,
  personaLabelForSemanticCapability,
} from './canonical-decision-l2-state-machine.util';

describe('canonical-decision-l2-state-machine', () => {
  it('UD-FE-001: weather semantic → canonical L2', () => {
    expect(
      isCanonicalL2Problem({
        semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
        route: { resolution: 'PRIMARY', engineId: 'CANONICAL_DECISION_RUNTIME' },
      }),
    ).toBe(true);
  });

  it('UD-FE-002: PROPOSED → AWAITING_AUTHORIZE', () => {
    expect(
      classifyCanonicalL2Phase({
        recordStatus: 'PROPOSED',
        planVersionStatus: 'PENDING_AUTHORIZATION',
        requiresUserConfirmation: true,
      }),
    ).toBe('AWAITING_AUTHORIZE');
  });

  it('UD-FE-003: AUTHORIZED → AWAITING_EXECUTE', () => {
    expect(
      classifyCanonicalL2Phase({
        recordStatus: 'AUTHORIZED',
        planVersionStatus: 'PENDING_AUTHORIZATION',
      }),
    ).toBe('AWAITING_EXECUTE');
  });

  it('UD-FE-004: persona label for weather', () => {
    expect(personaLabelForSemanticCapability('WEATHER_ACTIVITY_PROHIBITED')).toBe('Abu');
  });

  it('UD-FE-005: L3 confirmation → AWAITING_CONFIRMATION', () => {
    expect(
      classifyCanonicalL2Phase({
        recordStatus: 'PROPOSED',
        planVersionStatus: 'PENDING_AUTHORIZATION',
        requiresL3Confirmation: true,
      }),
    ).toBe('AWAITING_CONFIRMATION');
  });

  it('UD-FE-006: BLOCKED / EXPIRED record statuses', () => {
    expect(classifyCanonicalL2Phase({ recordStatus: 'BLOCKED' })).toBe('BLOCKED');
    expect(classifyCanonicalL2Phase({ recordStatus: 'EXPIRED' })).toBe('EXPIRED');
  });
});
