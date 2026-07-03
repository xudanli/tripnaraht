import { RFC001_REASON_CODES } from '../../../trips/guardian-decision-core/reason-codes/reason-code.registry';
import {
  extractConstraintEvaluationFromRfc001Run,
  runOrchestrationModeSafetyParityL2,
} from './orchestration-mode-safety-parity-l2.util';
import { safetyVerdictsMatch } from './orchestration-mode-safety-parity.util';

describe('orchestration-mode-safety-parity-l2.util', () => {
  const prevLegacyGuard = process.env.LEGACY_MUTATION_WRITE_GUARD;
  const prevShadow = process.env.RFC001_SHADOW_MODE;

  beforeEach(() => {
    process.env.LEGACY_MUTATION_WRITE_GUARD = 'ENFORCE';
    process.env.RFC001_SHADOW_MODE = '0';
  });

  afterEach(() => {
    if (prevLegacyGuard === undefined) delete process.env.LEGACY_MUTATION_WRITE_GUARD;
    else process.env.LEGACY_MUTATION_WRITE_GUARD = prevLegacyGuard;
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
  });

  it('extracts BLOCK + ROAD_SEGMENT_CLOSED from live RFC001 workspace', async () => {
    const l2 = await runOrchestrationModeSafetyParityL2();
    const extracted = extractConstraintEvaluationFromRfc001Run(l2.run);

    expect(extracted.verdict).toBe('BLOCK');
    expect(extracted.hardConstraintViolations).toContain(
      RFC001_REASON_CODES.ROAD_SEGMENT_CLOSED,
    );
    expect(extracted.evaluationId).toContain('eval_ws_');
  });

  it('all three modes match on live-extracted constraint block', async () => {
    const l2 = await runOrchestrationModeSafetyParityL2();

    for (const [mode, verdict] of Object.entries(l2.modeVerdicts)) {
      expect(safetyVerdictsMatch(verdict, l2.canonicalVerdict)).toBe(true);
      expect(verdict.writeAllowed).toBe(false);
      expect(verdict.executable).toBe(false);
      expect(verdict.needsConfirmation).toBe(true);
      expect(mode).toMatch(/^(CLAUDE_SM|CLAUDE_DYNAMIC|LEGACY)$/);
    }
  });
});
