import {
  assertDecisionClosureHints,
  loadDecisionClosureGolden,
  projectDecisionClosureExplain,
} from './decision-closure-assertions';
import { icelandDecisionClosureStormF208Case } from './e2e-cases/iceland-decision-closure-storm-f208.example';
import { icelandDecisionClosureRingStableCase } from './e2e-cases/iceland-decision-closure-ring-stable.example';

describe('decision-closure-assertions', () => {
  it('loadDecisionClosureGolden reads optimizationHints from fixture file', () => {
    const hints = loadDecisionClosureGolden(icelandDecisionClosureStormF208Case.metadata ?? {});
    expect(hints?.recommendedAlternativeId).toBe('repair-spatial-poi-v2');
  });

  it('projectDecisionClosureExplain uses snake_case for API contract', () => {
    const hints = loadDecisionClosureGolden(icelandDecisionClosureRingStableCase.metadata ?? {});
    const explain = projectDecisionClosureExplain(hints!);
    expect(explain?.decision_verdict?.chosen_plan_id).toBe('base');
    expect(explain?.world_constraint_materialization?.applied_events).toBe(0);
    expect(explain).not.toHaveProperty('appliedEvents');
  });

  it('assertDecisionClosureHints fails when roadIds missing', () => {
    const hints = loadDecisionClosureGolden(icelandDecisionClosureStormF208Case.metadata ?? {});
    const { passed, diff } = assertDecisionClosureHints(hints!, {
      worldMaterialization: { roadIdsIncludes: ['F999'] },
    });
    expect(passed).toBe(false);
    expect(diff.some((d) => d.includes('F999'))).toBe(true);
  });
});
