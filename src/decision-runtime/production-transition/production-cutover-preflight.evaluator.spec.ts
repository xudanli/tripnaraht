import {
  evaluatePreCutoverPreflight,
  evaluatePostRestartPreflight,
} from './production-cutover-preflight.evaluator';
import { verifyPreCutoverRuntimePosture } from './production-cutover-runtime-verify.util';

describe('verifyPreCutoverRuntimePosture', () => {
  it('passes when system is still Legacy before cutover', () => {
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
    expect(result.expectedLegacyBeforeCutover).toBe(true);
  });

  it('fails when system is already on Canonical cutover posture', () => {
    const result = verifyPreCutoverRuntimePosture({
      mode: 'CANONICAL',
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
    expect(result.pass).toBe(false);
  });
});

describe('evaluatePreCutoverPreflight', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.CUTOVER_DB_SNAPSHOT_CONFIRMED;
    delete process.env.CUTOVER_INFLIGHT_CLEAR_CONFIRMED;
  });

  afterEach(() => {
    process.env = env;
  });

  it('does not require Canonical runtime posture pre-cutover', () => {
    const report = evaluatePreCutoverPreflight();
    const runtimeItem = report.items.find((i) => i.id === 'runtime-posture-pre');
    expect(runtimeItem?.pass).toBe(true);
    expect(report.runtimePosture).toBe('EXPECTED_LEGACY_BEFORE_CUTOVER');
    expect(report.cutoverComplete).toBe(false);
    expect(report.preCutoverReady).toBe(false);
    expect(report.blockers).not.toContain('runtime-posture-pre');
  });
});

describe('evaluatePostRestartPreflight', () => {
  it('requires runtime-verify and smoke artifacts', () => {
    const report = evaluatePostRestartPreflight('/nonexistent-path-for-artifacts');
    expect(report.stage).toBe('post-restart');
    expect(report.cutoverComplete).toBe(false);
    expect(report.blockers).toContain('runtime-posture-live');
    expect(report.blockers).toContain('smoke');
  });
});
