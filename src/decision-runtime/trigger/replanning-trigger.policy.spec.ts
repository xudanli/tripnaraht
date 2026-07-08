import { evaluateReplanningTrigger } from './replanning-trigger.policy';

describe('replanning-trigger.policy', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.REPLANNING_TRIGGER_POLICY_ENABLED;
  });

  afterAll(() => {
    process.env = env;
  });

  it('defaults to USER_CONFIRMATION_REQUIRED when policy disabled', () => {
    const result = evaluateReplanningTrigger({
      tripId: 't1',
      triggerKind: 'WORLD_EVENT',
      eventSeverity: 'HIGH',
    });
    expect(result.policyEnabled).toBe(false);
    expect(result.action).toBe('USER_CONFIRMATION_REQUIRED');
  });

  it('returns NO_OP for monitoring poll without stale decision', () => {
    process.env.REPLANNING_TRIGGER_POLICY_ENABLED = '1';
    const result = evaluateReplanningTrigger({
      tripId: 't1',
      triggerKind: 'CANONICAL_MONITORING_POLL',
      decisionRecordStale: false,
    });
    expect(result.action).toBe('NO_OP');
  });

  it('returns LOCAL_REPAIR for medium world events', () => {
    process.env.REPLANNING_TRIGGER_POLICY_ENABLED = '1';
    const result = evaluateReplanningTrigger({
      tripId: 't1',
      triggerKind: 'WORLD_EVENT',
      eventSeverity: 'MEDIUM',
    });
    expect(result.action).toBe('LOCAL_REPAIR');
  });
});
