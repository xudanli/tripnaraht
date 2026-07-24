import {
  isConstraintAgentBlockDelegated,
} from './constraints/constraint-plan-verify.config';
import {
  isPhase6AgentBlockAlwaysDelegated,
  isPhase6AssemblerLegacyDomainRulesSkipped,
  isPhase6GateEvalFormalBlockDelegated,
  isPhase6LegacyDeprecationEnabled,
  isPhase6NonCanonicalApplyBlocked,
  isPhase6OfficialRulePersistenceBlocked,
  isPhase6OfficialTripConstraintProblemMergeDisabled,
} from './phase6-legacy-deprecation.config';
import { isPhase6GatewayDomainRulesExclusive } from './constraints/constraint-plan-verify.config';

describe('Phase 6 legacy deprecation config', () => {
  const original = process.env.PHASE6_LEGACY_DEPRECATION;
  const originalAgent = process.env.CONSTRAINT_AGENT_BLOCK_DELEGATED;
  const originalProjection = process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION;

  afterEach(() => {
    if (original === undefined) delete process.env.PHASE6_LEGACY_DEPRECATION;
    else process.env.PHASE6_LEGACY_DEPRECATION = original;
    if (originalAgent === undefined) delete process.env.CONSTRAINT_AGENT_BLOCK_DELEGATED;
    else process.env.CONSTRAINT_AGENT_BLOCK_DELEGATED = originalAgent;
    if (originalProjection === undefined) delete process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION;
    else process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION = originalProjection;
  });

  it('CAS-090: PHASE6_LEGACY_DEPRECATION enables all deprecation gates', () => {
    process.env.PHASE6_LEGACY_DEPRECATION = '1';
    expect(isPhase6LegacyDeprecationEnabled()).toBe(true);
    expect(isPhase6AgentBlockAlwaysDelegated()).toBe(true);
    expect(isPhase6OfficialRulePersistenceBlocked()).toBe(true);
    expect(isPhase6OfficialTripConstraintProblemMergeDisabled()).toBe(true);
    expect(isPhase6NonCanonicalApplyBlocked()).toBe(true);
    expect(isPhase6AssemblerLegacyDomainRulesSkipped()).toBe(true);
    expect(isPhase6GateEvalFormalBlockDelegated()).toBe(true);
  });

  it('CAS-091: Phase 6 forces agent block delegation without projection flag', () => {
    process.env.PHASE6_LEGACY_DEPRECATION = '1';
    delete process.env.CONSTRAINT_AGENT_BLOCK_DELEGATED;
    delete process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION;
    expect(isConstraintAgentBlockDelegated()).toBe(true);
  });

  it('CAS-116: gateway domain rules exclusive requires Phase6 + PLAN_VERIFY projection', () => {
    delete process.env.PHASE6_LEGACY_DEPRECATION;
    delete process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION;
    expect(isPhase6GatewayDomainRulesExclusive()).toBe(false);

    process.env.PHASE6_LEGACY_DEPRECATION = '1';
    expect(isPhase6GatewayDomainRulesExclusive()).toBe(false);

    process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION = '1';
    expect(isPhase6GatewayDomainRulesExclusive()).toBe(true);
  });
});
