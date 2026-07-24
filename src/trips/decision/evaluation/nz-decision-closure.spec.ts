/**
 * P0：新西兰 decision-closure golden + gate（国家包扩展样板）。
 */
import {
  assertDecisionClosureHints,
  loadDecisionClosureGolden,
  projectDecisionClosureExplain,
} from './decision-closure-assertions';
import { nzDecisionClosureMilfordRainCase } from './e2e-cases/nz-decision-closure-milford-rain.example';

describe('NZ decision closure v1 (P0 country pack extension)', () => {
  it('Milford SH94 golden satisfies decisionClosure expected', () => {
    const hints = loadDecisionClosureGolden(nzDecisionClosureMilfordRainCase.metadata ?? {});
    expect(hints).toBeDefined();
    const exp = nzDecisionClosureMilfordRainCase.expected.scientificExpected!.decisionClosure!;
    const { passed, diff } = assertDecisionClosureHints(hints!, exp);
    expect(diff).toEqual([]);
    expect(passed).toBe(true);
  });

  it('projects explain.optimization snake_case from NZ golden hints', () => {
    const hints = loadDecisionClosureGolden(nzDecisionClosureMilfordRainCase.metadata ?? {});
    const explain = projectDecisionClosureExplain(hints!);
    expect(explain?.decision_verdict?.chosen_plan_id).toBe('repair-milford-cruise-v1');
    expect(explain?.world_constraint_materialization?.road_ids).toContain('SH94');
    expect(explain?.decision_verdict_narration_zh).toMatch(/推荐方案/);
  });
});
