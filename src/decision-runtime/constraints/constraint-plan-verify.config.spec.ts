import {
  isConstraintAgentBlockDelegated,
  isConstraintCandidateFacadeEnabled,
  isConstraintGatewayPlanVerifyProjectionEnabled,
} from './constraint-plan-verify.config';

describe('constraint-plan-verify.config', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION;
    delete process.env.CONSTRAINT_CANDIDATE_FACADE;
    delete process.env.CONSTRAINT_AGENT_BLOCK_DELEGATED;
  });

  afterAll(() => {
    process.env = env;
  });

  it('CAS-013: agent block delegates when PLAN_VERIFY projection is on', () => {
    process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION = '1';
    expect(isConstraintGatewayPlanVerifyProjectionEnabled()).toBe(true);
    expect(isConstraintCandidateFacadeEnabled()).toBe(true);
    expect(isConstraintAgentBlockDelegated()).toBe(true);
  });

  it('CAS-014: agent block can be explicitly disabled while projection is on', () => {
    process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION = '1';
    process.env.CONSTRAINT_AGENT_BLOCK_DELEGATED = '0';
    expect(isConstraintAgentBlockDelegated()).toBe(false);
  });
});
