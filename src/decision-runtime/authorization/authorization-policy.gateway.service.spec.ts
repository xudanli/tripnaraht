import { AuthorizationPolicyGatewayService } from './authorization-policy.gateway.service';

describe('AuthorizationPolicyGatewayService', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED;
  });

  afterAll(() => {
    process.env = env;
  });

  it('delegates to legacy when gateway disabled', async () => {
    const svc = new AuthorizationPolicyGatewayService();
    const result = await svc.evaluate({
      scope: 'DECISION',
      tripId: 't1',
      candidateId: 'cand_a',
    });
    expect(result.delegatedToLegacy).toBe(true);
    expect(result.outcome).toBe('ASK');
  });

  it('returns ASK for L2 decision with candidate when enabled', async () => {
    process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED = '1';
    const svc = new AuthorizationPolicyGatewayService();
    const result = await svc.evaluate({
      scope: 'DECISION',
      tripId: 't1',
      candidateId: 'cand_a',
    });
    expect(result.delegatedToLegacy).toBeUndefined();
    expect(result.outcome).toBe('ASK');
    expect(result.reasonCodes).toContain('L2_USER_CONFIRMATION_REQUIRED');
  });

  it('denies candidate with non-overridable workspace BLOCK', async () => {
    process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED = '1';
    const svc = new AuthorizationPolicyGatewayService(
      undefined,
      {
        getDecision: jest.fn(async () => ({
          decisionId: 'dec_1',
          workspaceId: 'ws_1',
        })),
      } as never,
      {
        get: jest.fn(async () => ({
          workspaceId: 'ws_1',
          constraintAssertions: [
            {
              targetCandidateId: 'cand_a',
              verdict: 'BLOCK',
              overridable: false,
            },
          ],
        })),
      } as never,
    );

    const result = await svc.evaluate({
      scope: 'DECISION',
      tripId: 't1',
      decisionId: 'dec_1',
      candidateId: 'cand_a',
    });

    expect(result.outcome).toBe('DENY');
    expect(result.reasonCodes).toContain('CANDIDATE_NON_OVERRIDABLE_BLOCK');
  });

  it('denies execute when decision record is not AUTHORIZED', async () => {
    process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED = '1';
    const svc = new AuthorizationPolicyGatewayService(
      undefined,
      {
        getDecision: jest.fn(async () => ({
          decisionId: 'dec_1',
          recordStatus: 'PROPOSED',
        })),
      } as never,
    );

    const result = await svc.evaluate({
      scope: 'EFFECTIVE_PLAN_COMMIT',
      tripId: 't1',
      decisionId: 'dec_1',
    });

    expect(result.outcome).toBe('DENY');
    expect(result.reasonCodes).toContain('DECISION_NOT_AUTHORIZED');
  });

  it('returns ALLOW for weather under AUTO_EXECUTE when semantic metadata provided', async () => {
    process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED = '1';
    const prisma = {
      trip: {
        findUnique: jest.fn(async () => ({
          metadata: {
            travelDecisionContract: {
              automation: {
                defaultLevel: 'AUTO_EXECUTE_CONDITIONAL',
                autoAllowed: ['weather_hazard_replan'],
                confirmationRequired: ['change_lodging'],
              },
            },
          },
          budgetConfig: {},
        })),
      },
    } as never;

    const svc = new AuthorizationPolicyGatewayService(prisma);
    const result = await svc.evaluate({
      scope: 'DECISION',
      tripId: 't1',
      candidateId: 'cand_indoor',
      metadata: {
        semanticKey: 'WEATHER_ACTIVITY_PROHIBITED:evt_1',
        semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
      },
    });

    expect(result.outcome).toBe('ALLOW');
    expect(result.reasonCodes).toContain('AUTOMATION_AUTO_ALLOWED');
  });
});
