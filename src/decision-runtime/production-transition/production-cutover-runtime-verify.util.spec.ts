import { verifyCutoverRuntimePosture, verifyPreCutoverRuntimePosture } from './production-cutover-runtime-verify.util';

describe('verifyPreCutoverRuntimePosture', () => {
  it('passes legacy posture before cutover', () => {
    const result = verifyPreCutoverRuntimePosture({
      mode: 'LEGACY',
      productionTransition: {
        schemaId: 'tripnara.production_transition_phase@v1',
        decisionRuntimePhase: 'PRODUCTION_OBSERVATION',
        currentAuthority: 'LEGACY',
        canonicalRollout: 'OFF',
        lexRole: 'SHADOW_ONLY',
        engineeringComplete: true,
        canonicalProductionAuthority: false,
        legacyDeprecated: false,
        optimizationAuthority: 'legacy-frozen',
      },
    });
    expect(result.pass).toBe(true);
  });
});

describe('verifyCutoverRuntimePosture', () => {
  it('passes canonical cutover posture', () => {
    const result = verifyCutoverRuntimePosture({
      mode: 'CANONICAL',
      optimizationStrategyMode: 'LEGACY',
      constraintGatewayMode: 'ON_FOR_SELECTED',
      decisionTriggerGateway: true,
      authorizationPolicyGateway: true,
      replanningTriggerPolicy: false,
      effectivePlanWriteGuard: true,
      productionTransition: {
        schemaId: 'tripnara.production_transition_phase@v1',
        decisionRuntimePhase: 'PRODUCTION_CUTOVER',
        currentAuthority: 'CANONICAL',
        canonicalRollout: 'ON',
        lexRole: 'SHADOW_ONLY',
        engineeringComplete: true,
        canonicalProductionAuthority: true,
        legacyDeprecated: false,
        optimizationAuthority: 'legacy-frozen',
      },
    });
    expect(result.pass).toBe(true);
  });

  it('fails when authority still LEGACY', () => {
    const result = verifyCutoverRuntimePosture({
      mode: 'SHADOW',
      optimizationStrategyMode: 'AUTO',
      constraintGatewayMode: 'SHADOW_COMPARE',
      decisionTriggerGateway: true,
      replanningTriggerPolicy: true,
      effectivePlanWriteGuard: true,
      productionTransition: {
        schemaId: 'tripnara.production_transition_phase@v1',
        decisionRuntimePhase: 'PRODUCTION_OBSERVATION',
        currentAuthority: 'LEGACY',
        canonicalRollout: 'SELECTIVE',
        lexRole: 'SHADOW_ONLY',
        engineeringComplete: true,
        canonicalProductionAuthority: false,
        legacyDeprecated: false,
        optimizationAuthority: 'legacy-frozen',
      },
    });
    expect(result.pass).toBe(false);
    expect(result.blockers).toContain('runtime-mode');
  });
});
