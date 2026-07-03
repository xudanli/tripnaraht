import { getAuthorityCase } from '../authority/authority-cases.registry';
import {
  assertSafetyVerdictParity,
  authorityAssert,
  expectAuthorityPass,
  runAuthorityCase,
} from '../assertions/canonical-authority.assertions';
import { ICELAND_F208_ROAD_CLOSE_PARITY_FIXTURE } from './fixtures/hard-constraint-parity.fixture';
import {
  deriveAllModeSafetyVerdicts,
  projectCanonicalSafetyVerdictFromConstraint,
  safetyVerdictsMatch,
} from './orchestration-mode-safety-parity.util';

/**
 * AU-P1-007 — Three orchestration modes must share safety verdict on same hard-constraint fixture.
 */
describe('AU-P1-007 — Orchestration mode safety parity', () => {
  const caseDef = getAuthorityCase('AU-P1-007')!;
  const prevLegacyGuard = process.env.LEGACY_MUTATION_WRITE_GUARD;

  beforeEach(() => {
    process.env.LEGACY_MUTATION_WRITE_GUARD = 'ENFORCE';
  });

  afterEach(() => {
    if (prevLegacyGuard === undefined) delete process.env.LEGACY_MUTATION_WRITE_GUARD;
    else process.env.LEGACY_MUTATION_WRITE_GUARD = prevLegacyGuard;
  });

  it(caseDef.description, async () => {
    const fixture = ICELAND_F208_ROAD_CLOSE_PARITY_FIXTURE;
    const canonicalVerdict = projectCanonicalSafetyVerdictFromConstraint(
      fixture.constraintEvaluation,
    );
    const modeVerdicts = deriveAllModeSafetyVerdicts(fixture);

    const result = await runAuthorityCase({
      caseId: caseDef.caseId,
      run: async () => {
        const assertions = Object.entries(modeVerdicts).flatMap(([mode, verdict]) => [
          assertSafetyVerdictParity({ mode, ...verdict }),
          authorityAssert({
            layer: 'constraint_gateway',
            name: `parity_${mode}_matches_canonical`,
            pass: safetyVerdictsMatch(verdict, canonicalVerdict),
            expected: canonicalVerdict,
            actual: verdict,
            message: `${mode} safety verdict must match canonical hard-constraint projection`,
          }),
          authorityAssert({
            layer: 'write_guard',
            name: `${mode}_blocks_write_on_hard_violation`,
            pass: verdict.writeAllowed === false,
            expected: false,
            actual: verdict.writeAllowed,
          }),
        ]);

        assertions.push(
          authorityAssert({
            layer: 'constraint_gateway',
            name: 'all_modes_share_violation_codes',
            pass: Object.values(modeVerdicts).every(
              (v) => v.violationCodes.join() === canonicalVerdict.violationCodes.join(),
            ),
            expected: canonicalVerdict.violationCodes,
            actual: Object.fromEntries(
              Object.entries(modeVerdicts).map(([m, v]) => [m, v.violationCodes]),
            ),
          }),
        );

        return assertions;
      },
    });

    expectAuthorityPass(result);
  });
});
