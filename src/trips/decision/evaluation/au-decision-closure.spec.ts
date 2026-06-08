/**
 * P0：澳大利亚 decision-closure golden + explain 投影。
 */
import {
  assertDecisionClosureHints,
  loadDecisionClosureGolden,
  projectDecisionClosureExplain,
} from './decision-closure-assertions';
import { auDecisionClosureGreatOceanFireCase } from './e2e-cases/au-decision-closure-great-ocean-fire.example';

describe('AU decision closure v1 (P0 country pack extension)', () => {
  it('Great Ocean Road B100 golden satisfies decisionClosure expected', () => {
    const hints = loadDecisionClosureGolden(auDecisionClosureGreatOceanFireCase.metadata ?? {});
    expect(hints).toBeDefined();
    const exp = auDecisionClosureGreatOceanFireCase.expected.scientificExpected!.decisionClosure!;
    const { passed, diff } = assertDecisionClosureHints(hints!, exp);
    expect(diff).toEqual([]);
    expect(passed).toBe(true);
  });

  it('projects explain.optimization snake_case from AU golden hints', () => {
    const hints = loadDecisionClosureGolden(auDecisionClosureGreatOceanFireCase.metadata ?? {});
    const explain = projectDecisionClosureExplain(hints!);
    expect(explain?.decision_verdict?.chosen_plan_id).toBe('repair-gor-inland-v1');
    expect(explain?.world_constraint_materialization?.road_ids).toContain('B100');
    expect(explain?.decision_verdict_narration_zh).toMatch(/推荐方案/);
  });
});
