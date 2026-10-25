import { buildProactiveImpactFromWeather } from '../adapters/build-proactive-impact.util';
import { planLensesForProactiveCase } from '../lenses/evaluate-lens-activation.util';
import { synthesizeProactiveRecommendation } from '../synthesis/synthesize-proactive-recommendation.util';
import { evaluateProactiveIntervention } from '../intervention/evaluate-proactive-intervention.util';
import {
  buildProactiveDecisionTrace,
  toProactiveDecisionTraceReplayJson,
} from './build-proactive-decision-trace.util';

describe('Phase 4 P0 — Decision Trace', () => {
  it('builds replayable why-trace for Reynisfjara wind', () => {
    const impact = buildProactiveImpactFromWeather({
      tripId: 'trip_trace',
      signalEventId: 'evt_wind',
      signalKind: 'WEATHER_WIND',
      weatherImpact: {
        affectedPlanItemIds: ['item_reynisfjara'],
        affectedEntityRefs: [
          { kind: 'PLAN_ITEM', id: 'item_reynisfjara', label: 'Reynisfjara' },
        ],
      },
      affectedItemLabels: ['Reynisfjara'],
    });
    const lens = planLensesForProactiveCase({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      signalKind: 'WEATHER_WIND',
      needAlternative: true,
    });
    const syn = synthesizeProactiveRecommendation({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      lens,
      impactZh: impact.rationaleZh,
    });
    expect(syn.ok).toBe(true);
    if (!syn.ok) return;
    const intervention = evaluateProactiveIntervention({
      impact,
      synthesis: syn.synthesis,
      decisionProblemId: 'problem_trace',
      attentionCost: 0.05,
      threshold: 0.05,
    });

    const trace = buildProactiveDecisionTrace({
      impact,
      lens,
      synthesis: syn.synthesis,
      intervention,
      decisionProblemId: 'problem_trace',
      windFromMps: 14,
      windToMps: 25,
      localTimeHint: '16:00',
    });

    expect(trace.schemaId).toBe('nara.proactive_decision_trace@v1');
    expect(trace.signal.label).toBe('WIND_CHANGE');
    expect(trace.impact.key).toBe('REYNISFJARA_AFFECTED');
    expect(trace.abu.risk).toBe('HIGH');
    expect(trace.dre.utilityDrop).toBe(true);
    expect(trace.neptune.alternatives).toBeGreaterThan(0);
    expect(trace.cgus.selected).toBeTruthy();
    expect(trace.intervention.value).toBeGreaterThan(0);
    expect(trace.whyExplainZh).not.toMatch(/Abu|Neptune/i);

    const replay = toProactiveDecisionTraceReplayJson(trace);
    expect(replay).toMatchObject({
      signal: 'WIND_CHANGE',
      impact: 'REYNISFJARA_AFFECTED',
    });
    expect((replay.abu as { risk: string }).risk).toBe('HIGH');
    expect((replay.dre as { utility_drop: boolean }).utility_drop).toBe(true);
  });
});
