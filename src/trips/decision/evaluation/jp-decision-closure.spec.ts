/**
 * P0：日本 decision-closure golden + explain 投影。
 */
import {
  assertDecisionClosureHints,
  loadDecisionClosureGolden,
  projectDecisionClosureExplain,
} from './decision-closure-assertions';
import { jpDecisionClosureIzuTyphoonCase } from './e2e-cases/jp-decision-closure-izu-typhoon.example';

describe('JP decision closure v1 (P0 country pack extension)', () => {
  it('Izu Route 134 typhoon golden satisfies decisionClosure expected', () => {
    const hints = loadDecisionClosureGolden(jpDecisionClosureIzuTyphoonCase.metadata ?? {});
    expect(hints).toBeDefined();
    const exp = jpDecisionClosureIzuTyphoonCase.expected.scientificExpected!.decisionClosure!;
    const { passed, diff } = assertDecisionClosureHints(hints!, exp);
    expect(diff).toEqual([]);
    expect(passed).toBe(true);
  });

  it('projects explain.optimization snake_case from JP golden hints', () => {
    const hints = loadDecisionClosureGolden(jpDecisionClosureIzuTyphoonCase.metadata ?? {});
    const explain = projectDecisionClosureExplain(hints!);
    expect(explain?.decision_verdict?.chosen_plan_id).toBe('repair-izu-inland-v1');
    expect(explain?.world_constraint_materialization?.road_ids).toContain('ROUTE134');
    expect(explain?.decision_verdict_narration_zh).toMatch(/推荐方案/);
  });
});
