/**
 * Phase 4 P0 — Golden Case E2E (product experience, not just API smoke).
 * Cases: A coastal wind · B road close Hard Gate · C activity window.
 */

import {
  PROACTIVE_V1_HARNESS_FIXTURES,
  runProactiveDecisionHarnessFixture,
} from './run-proactive-decision-harness.util';
import {
  toProactiveDecisionTraceReplayJson,
} from '../trace/build-proactive-decision-trace.util';

describe('Phase 4 P0 — Golden Case E2E', () => {
  it('Case A Reynisfjara wind 14→25: full chain + Decision Trace + card layers', async () => {
    const fixture = PROACTIVE_V1_HARNESS_FIXTURES.find(
      (f) => f.id === 'F_REYNISFJARA_WIND',
    )!;
    const run = await runProactiveDecisionHarnessFixture(fixture);

    // Backend: WorldSignal → Impact → DecisionProblem
    expect(run.impact.signalKind).toBe('WEATHER_WIND');
    expect(run.impact.affectedItems).toContain('item_reynisfjara');
    expect(run.impact.caseId).toBe('CASE_CONTINUE_ACTIVITY');
    expect(run.impact.decisionRequired).toBe(true);
    expect(run.problemId).toMatch(/^problem_pd_/);

    // Lenses: Abu + Dr.Dre required; Neptune conditional (activated)
    expect(run.decisionTrace.lenses.activateAbu).toBe(true);
    expect(run.decisionTrace.lenses.activateDrDre).toBe(true);
    expect(run.decisionTrace.neptune.mode).toBe('conditional');
    expect(run.decisionTrace.neptune.activated).toBe(true);
    expect(run.decisionTrace.abu.required).toBe(true);
    expect(run.decisionTrace.abu.risk).toBe('HIGH');
    expect(run.decisionTrace.dre.required).toBe(true);
    expect(run.decisionTrace.dre.utilityDrop).toBe(true);

    // Synthesis outputs
    expect(run.synthesis.recommended.optionId).toBeTruthy();
    expect(run.synthesis.confidence).toBeGreaterThan(0);
    expect(run.synthesis.reasonZh.length).toBeGreaterThan(0);
    expect(run.synthesis.impactZh.length).toBeGreaterThan(0);

    // iOS card layers + CTAs (product surface)
    const card = run.reminderCard;
    expect(card).not.toBeNull();
    expect(card!.layer1WhatHappenedZh.length).toBeGreaterThan(0);
    expect(card!.layer2WhatImpactedZh).toContain('Reynisfjara');
    expect(card!.layer3SuggestionZh.length).toBeGreaterThan(0);
    expect(card!.ctas.map((c) => c.id).sort()).toEqual(
      ['DEFER', 'VIEW_OPTIONS', 'WHY'].sort(),
    );
    // No persona names in user-facing layers
    const userText = [
      card!.layer1WhatHappenedZh,
      card!.layer2WhatImpactedZh,
      card!.layer3SuggestionZh,
      run.decisionTrace.whyExplainZh,
    ].join(' ');
    expect(userText).not.toMatch(/Abu|Dr\.?\s*Dre|Neptune/i);

    // Decision Trace replay shape
    const replay = toProactiveDecisionTraceReplayJson(run.decisionTrace);
    expect(replay.signal).toBe('WIND_CHANGE');
    expect(String(replay.impact)).toContain('REYNISFJARA');
    expect(run.decisionTrace.signal.windFromMps).toBe(14);
    expect(run.decisionTrace.signal.windToMps).toBe(25);
    expect(run.decisionTrace.signal.localTimeHint).toBe('16:00');
    expect(run.decisionTrace.cgus.selected).toBeTruthy();
    expect(run.decisionTrace.intervention.value).toBeGreaterThan(0);
    expect(run.interventionGate).toBe('NOTIFY_CARD');
  });

  it('Case B road close: Abu + Neptune, must repair, Hard Gate cannot KEEP', async () => {
    const fixture = PROACTIVE_V1_HARNESS_FIXTURES.find(
      (f) => f.id === 'F_FROAD_DIFFICULT',
    )!;
    const run = await runProactiveDecisionHarnessFixture(fixture);

    expect(run.impact.caseId).toBe('CASE_REROUTE');
    expect(run.decisionTrace.lenses.activateAbu).toBe(true);
    expect(run.decisionTrace.neptune.activated).toBe(true);
    expect(run.recommendedOptionId).not.toBe('OPT_KEEP_ORIGINAL');
    expect(run.acceptance.F9).toBe(true);
    expect(run.decisionTrace.signal.label).toBe('ROAD_DIFFICULTY_CHANGE');
  });

  it('Case C glacier window closed: Abu + Dre + Neptune → postpone/substitute', async () => {
    const fixture = PROACTIVE_V1_HARNESS_FIXTURES.find(
      (f) => f.id === 'F_GLACIER_WINDOW_CLOSED',
    )!;
    const run = await runProactiveDecisionHarnessFixture(fixture);

    expect(run.impact.caseId).toBe('CASE_POSTPONE_ACTIVITY');
    expect(run.decisionTrace.lenses.activateAbu).toBe(true);
    expect(run.decisionTrace.lenses.activateDrDre).toBe(true);
    expect(run.decisionTrace.neptune.activated).toBe(true);
    expect([
      'OPT_POSTPONE_NEXT_WINDOW',
      'OPT_INDOOR_SUBSTITUTE',
      'OPT_CANCEL_ACTIVITY',
    ]).toContain(run.recommendedOptionId);
    expect(run.synthesis.confidence).toBeGreaterThan(0);
    expect(run.decisionTrace.whyExplainZh.length).toBeGreaterThan(0);
  });
});
