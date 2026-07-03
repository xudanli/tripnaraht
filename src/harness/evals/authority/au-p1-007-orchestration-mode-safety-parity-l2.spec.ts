import { getAuthorityCase } from '../authority/authority-cases.registry';
import {
  assertSafetyVerdictParity,
  authorityAssert,
  expectAuthorityPass,
  runAuthorityCase,
} from '../assertions/canonical-authority.assertions';
import { ORIGINAL_CANDIDATE_ID } from '../../../trips/guardian-decision-core/adapters/repair-candidate.adapter';
import { RFC001_REASON_CODES } from '../../../trips/guardian-decision-core/reason-codes/reason-code.registry';
import {
  runOrchestrationModeSafetyParityL2,
} from './orchestration-mode-safety-parity-l2.util';
import { safetyVerdictsMatch } from './orchestration-mode-safety-parity.util';

/**
 * AU-P1-007 L2 — Same Iceland F208 road-close fixture via live RFC001 SM path;
 * CLAUDE_SM / CLAUDE_DYNAMIC / LEGACY must share safety verdict on extracted constraint block.
 */
describe('AU-P1-007 L2 — Orchestration mode safety parity (RFC001 harness)', () => {
  const caseDef = getAuthorityCase('AU-P1-007')!;
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

  it(`${caseDef.caseId}-L2: ${caseDef.description}`, async () => {
    const l2 = await runOrchestrationModeSafetyParityL2();

    const result = await runAuthorityCase({
      caseId: `${caseDef.caseId}-L2`,
      run: async () => {
        const assertions = [
          authorityAssert({
            layer: 'constraint_gateway',
            name: 'l2_sm_produces_road_segment_closed',
            pass: l2.constraintEvaluation.hardConstraintViolations.includes(
              RFC001_REASON_CODES.ROAD_SEGMENT_CLOSED,
            ),
            expected: RFC001_REASON_CODES.ROAD_SEGMENT_CLOSED,
            actual: l2.constraintEvaluation.hardConstraintViolations,
          }),
          authorityAssert({
            layer: 'constraint_gateway',
            name: 'l2_sm_blocks_original_candidate',
            pass: l2.run.workspace!.constraintAssertions.some(
              (a) =>
                a.targetCandidateId === ORIGINAL_CANDIDATE_ID &&
                a.verdict === 'BLOCK' &&
                !a.overridable,
            ),
            expected: true,
            actual: l2.run.workspace!.constraintAssertions.filter(
              (a) => a.targetCandidateId === ORIGINAL_CANDIDATE_ID,
            ),
          }),
        ];

        for (const [mode, verdict] of Object.entries(l2.modeVerdicts)) {
          assertions.push(
            assertSafetyVerdictParity({ mode, ...verdict }),
            authorityAssert({
              layer: 'constraint_gateway',
              name: `l2_parity_${mode}_matches_canonical`,
              pass: safetyVerdictsMatch(verdict, l2.canonicalVerdict),
              expected: l2.canonicalVerdict,
              actual: verdict,
              message: `${mode} L2 verdict must match canonical projection from live RFC001 constraint`,
            }),
            authorityAssert({
              layer: 'write_guard',
              name: `l2_${mode}_blocks_write_on_hard_violation`,
              pass: verdict.writeAllowed === false,
              expected: false,
              actual: verdict.writeAllowed,
            }),
          );
        }

        assertions.push(
          authorityAssert({
            layer: 'constraint_gateway',
            name: 'l2_all_modes_share_live_violation_codes',
            pass: Object.values(l2.modeVerdicts).every(
              (v) => v.violationCodes.join() === l2.canonicalVerdict.violationCodes.join(),
            ),
            expected: l2.canonicalVerdict.violationCodes,
            actual: Object.fromEntries(
              Object.entries(l2.modeVerdicts).map(([m, v]) => [m, v.violationCodes]),
            ),
          }),
        );

        return assertions;
      },
    });

    expectAuthorityPass(result);
  });
});
