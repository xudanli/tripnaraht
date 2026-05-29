/**
 * CLI helper: validate decision-closure golden cases (used by cgus replay / CI scripts).
 */
import type { E2ECase } from '../../src/trips/decision/evaluation/e2e-case.types';
import {
  assertDecisionClosureHints,
  loadDecisionClosureGolden,
  projectDecisionClosureExplain,
} from '../../src/trips/decision/evaluation/decision-closure-assertions';

export function runDecisionClosureGate(cases: readonly E2ECase[]): {
  passed: number;
  failed: number;
  results: Array<{ id: string; ok: boolean; diff: string[] }>;
} {
  const results: Array<{ id: string; ok: boolean; diff: string[] }> = [];
  let passed = 0;
  let failed = 0;

  for (const c of cases) {
    const expected = c.expected.scientificExpected?.decisionClosure;
    if (!expected) {
      results.push({ id: c.id, ok: true, diff: [] });
      passed++;
      continue;
    }
    const hints = loadDecisionClosureGolden(c.metadata ?? {});
    if (!hints) {
      results.push({ id: c.id, ok: false, diff: ['missing metadata.decisionClosureGolden'] });
      failed++;
      continue;
    }
    const hintResult = assertDecisionClosureHints(hints, expected);
    const explain = projectDecisionClosureExplain(hints);
    const explainDiff: string[] = [];
    if (!explain?.decision_verdict?.chosen_plan_id) {
      explainDiff.push('explain projection missing decision_verdict.chosen_plan_id');
    }
    if (
      expected.worldMaterialization?.minAppliedEvents !== undefined &&
      explain?.world_constraint_materialization?.applied_events === undefined
    ) {
      explainDiff.push('explain projection missing world_constraint_materialization.applied_events');
    }
    const diff = [...hintResult.diff, ...explainDiff];
    const ok = hintResult.passed && explainDiff.length === 0;
    results.push({ id: c.id, ok, diff });
    if (ok) passed++;
    else failed++;
  }

  return { passed, failed, results };
}
