import {
  ICELAND_F208_ROAD_CLOSE_PARITY_FIXTURE,
} from './fixtures/hard-constraint-parity.fixture';
import {
  deriveAllModeSafetyVerdicts,
  projectCanonicalSafetyVerdictFromConstraint,
  safetyVerdictsMatch,
} from './orchestration-mode-safety-parity.util';

describe('orchestration-mode-safety-parity.util', () => {
  const prevLegacyGuard = process.env.LEGACY_MUTATION_WRITE_GUARD;

  beforeEach(() => {
    process.env.LEGACY_MUTATION_WRITE_GUARD = 'ENFORCE';
  });

  afterEach(() => {
    if (prevLegacyGuard === undefined) delete process.env.LEGACY_MUTATION_WRITE_GUARD;
    else process.env.LEGACY_MUTATION_WRITE_GUARD = prevLegacyGuard;
  });

  it('projects canonical BLOCK verdict for F208 road close', () => {
    const verdict = projectCanonicalSafetyVerdictFromConstraint(
      ICELAND_F208_ROAD_CLOSE_PARITY_FIXTURE.constraintEvaluation,
    );
    expect(verdict).toEqual({
      executable: false,
      needsConfirmation: true,
      writeAllowed: false,
      violationCodes: ['ROAD_SEGMENT_CLOSED'],
    });
  });

  it('all three orchestration modes share safety verdict on same fixture', () => {
    const canonical = projectCanonicalSafetyVerdictFromConstraint(
      ICELAND_F208_ROAD_CLOSE_PARITY_FIXTURE.constraintEvaluation,
    );
    const modeVerdicts = deriveAllModeSafetyVerdicts(ICELAND_F208_ROAD_CLOSE_PARITY_FIXTURE);

    for (const [mode, verdict] of Object.entries(modeVerdicts)) {
      expect(safetyVerdictsMatch(verdict, canonical)).toBe(true);
      expect(verdict.writeAllowed).toBe(false);
      expect(verdict.violationCodes).toContain('ROAD_SEGMENT_CLOSED');
      expect(mode).toMatch(/^(CLAUDE_SM|CLAUDE_DYNAMIC|LEGACY)$/);
    }
  });
});
