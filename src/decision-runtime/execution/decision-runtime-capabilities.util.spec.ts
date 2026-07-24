import { resolveDecisionRuntimeCapabilities } from './decision-runtime-capabilities.util';

describe('resolveDecisionRuntimeCapabilities', () => {
  const envKeys = [
    'DECISION_RUNTIME_MODE',
    'CONSTRAINT_EVALUATION_GATEWAY_ENABLED',
    'CONSTRAINT_GATEWAY_MODE',
    'CANONICAL_FULL_PLAN_SELECTION',
    'GUIDE_CANONICAL_PLAN_SELECTION',
    'GUIDE_CANONICAL_ACCEPT_EXECUTE',
    'CANONICAL_EXECUTION_ENABLED',
    'EFFECTIVE_PLAN_WRITE_GUARD',
    'RFC001_SHADOW_MODE',
    'DECISION_GATEWAY_UNIFIED',
    'OPTIMIZATION_STRATEGY_MODE',
    'DECISION_LAB_ENABLED',
    'DECISION_TRIGGER_GATEWAY_ENABLED',
    'AUTHORIZATION_POLICY_GATEWAY_ENABLED',
    'REPLANNING_TRIGGER_POLICY_ENABLED',
  ] as const;

  const snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
  });

  it('defaults to LEGACY with features off', () => {
    const caps = resolveDecisionRuntimeCapabilities();
    expect(caps).toMatchObject({
      mode: 'LEGACY',
      constraintGateway: false,
      constraintGatewayMode: 'OFF',
      constraintGatewayShadowCompare: false,
      fullPlanSelection: false,
      guideCanonicalSelection: false,
      guideCanonicalAcceptExecute: false,
      canonicalExecute: false,
      effectivePlanWriteGuard: false,
      effectivePlanWriteChain: false,
      phase6LegacyDeprecation: false,
      constraintPlanVerifyProjection: false,
      gatewayDomainRulesExclusive: false,
      optimizationStrategyMode: 'AUTO',
      decisionLab: false,
      decisionTriggerGateway: false,
      authorizationPolicyGateway: false,
      replanningTriggerPolicy: false,
    });
    expect(caps.legacyConvergence).toBeDefined();
  });

  it('resolves full Guide Canonical stack', () => {
    process.env.DECISION_RUNTIME_MODE = 'CANONICAL';
    process.env.CONSTRAINT_EVALUATION_GATEWAY_ENABLED = '1';
    process.env.CANONICAL_FULL_PLAN_SELECTION = '1';
    process.env.GUIDE_CANONICAL_PLAN_SELECTION = '1';
    process.env.GUIDE_CANONICAL_ACCEPT_EXECUTE = '1';
    process.env.EFFECTIVE_PLAN_WRITE_GUARD = '1';

    expect(resolveDecisionRuntimeCapabilities()).toMatchObject({
      mode: 'CANONICAL',
      constraintGateway: true,
      constraintGatewayMode: 'ON',
      constraintGatewayShadowCompare: false,
      fullPlanSelection: true,
      guideCanonicalSelection: true,
      guideCanonicalAcceptExecute: true,
      canonicalExecute: true,
      effectivePlanWriteGuard: true,
    });
  });
});
