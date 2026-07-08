import { isDecisionGatewayUnifiedEnabled } from './decision-gateway.config';

describe('decision-gateway.config', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.DECISION_GATEWAY_UNIFIED;
    delete process.env.DECISION_PROBLEM_SSOT_STORE;
  });

  afterAll(() => {
    process.env = env;
  });

  it('CAS-023: unified is on by default when env unset', () => {
    expect(isDecisionGatewayUnifiedEnabled()).toBe(true);
  });

  it('CAS-024: unified can be disabled explicitly when SSOT is off', () => {
    process.env.DECISION_GATEWAY_UNIFIED = '0';
    expect(isDecisionGatewayUnifiedEnabled()).toBe(false);
  });

  it('CAS-022: unified cannot be disabled when SSOT store is on', () => {
    process.env.DECISION_PROBLEM_SSOT_STORE = '1';
    process.env.DECISION_GATEWAY_UNIFIED = '0';
    expect(isDecisionGatewayUnifiedEnabled()).toBe(true);
  });
});
