import {
  PROACTIVE_V1_HARNESS_FIXTURES,
  runProactiveDecisionHarnessFixture,
} from './run-proactive-decision-harness.util';
import {
  dedupeProactiveErcProjections,
  projectProactiveToErcItem,
} from '../erc/project-proactive-to-erc.util';
import { resolveProactiveDecisionFlagMatrix } from '../config/proactive-decision-flag-matrix.util';
import {
  computeNeptuneTriggerRate,
  computeProactiveAcceptRate,
  computeSilentSuppressRate,
  reduceProactiveTelemetryCounters,
} from '../telemetry/proactive-telemetry.util';
import { buildProactiveImpactFromWeather } from '../adapters/build-proactive-impact.util';
import { synthesizeProactiveRecommendation } from '../synthesis/synthesize-proactive-recommendation.util';
import { planLensesForProactiveCase } from '../lenses/evaluate-lens-activation.util';
import { evaluateProactiveIntervention } from '../intervention/evaluate-proactive-intervention.util';

describe('PD-8 ERC projection', () => {
  it('projects PD outputs with shared decisionProblemId and writeChain closed', () => {
    const impact = buildProactiveImpactFromWeather({
      tripId: 'trip_erc',
      signalEventId: 'evt_erc',
      signalKind: 'WEATHER_WIND',
      weatherImpact: {
        affectedPlanItemIds: ['item_a'],
        affectedEntityRefs: [{ kind: 'PLAN_ITEM', id: 'item_a' }],
      },
      affectedItemLabels: ['A'],
    });
    const lens = planLensesForProactiveCase({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      signalKind: 'WEATHER_WIND',
      needAlternative: true,
    });
    const syn = synthesizeProactiveRecommendation({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      lens,
    });
    expect(syn.ok).toBe(true);
    if (!syn.ok) return;
    const intervention = evaluateProactiveIntervention({
      impact,
      synthesis: syn.synthesis,
      decisionProblemId: 'problem_erc',
      attentionCost: 0.05,
      threshold: 0.05,
    });
    const item = projectProactiveToErcItem({
      impact,
      synthesis: syn.synthesis,
      intervention,
      changeDraft: null,
      decisionProblemId: 'problem_erc',
    });
    expect(item?.decisionProblemId).toBe('problem_erc');
    expect(item?.writeChainEnabled).toBe(false);
    expect(item?.source).toBe('PROACTIVE_DECISION_V1');
    expect(item?.dedupKey).toContain('evt_erc');
  });

  it('dedupes against existing ERC keys', () => {
    const impact = buildProactiveImpactFromWeather({
      tripId: 'trip_dup',
      signalEventId: 'evt_dup',
      signalKind: 'WEATHER_WIND',
      weatherImpact: {
        affectedPlanItemIds: ['item_a'],
        affectedEntityRefs: [{ kind: 'PLAN_ITEM', id: 'item_a' }],
      },
    });
    const lens = planLensesForProactiveCase({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      signalKind: 'WEATHER_WIND',
      needAlternative: true,
    });
    const syn = synthesizeProactiveRecommendation({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      lens,
    });
    if (!syn.ok) throw new Error('syn');
    const item = projectProactiveToErcItem({
      impact,
      synthesis: syn.synthesis,
      intervention: null,
      changeDraft: null,
      decisionProblemId: 'p1',
    })!;
    const { accepted, suppressed } = dedupeProactiveErcProjections({
      projections: [item, item],
      existingDedupKeys: [],
    });
    expect(accepted).toHaveLength(1);
    expect(suppressed).toHaveLength(1);
  });

  it('flag matrix keeps push/autoApply closed', () => {
    const m = resolveProactiveDecisionFlagMatrix({
      PROACTIVE_DECISION_V1_ENABLED: '1',
      PROACTIVE_DECISION_CONFIRM_APPLY_WRITE_ENABLED: '1',
    });
    expect(m.proactiveV1Enabled).toBe(true);
    expect(m.confirmApplyWriteEnabled).toBe(true);
    expect(m.pushNotifyEnabled).toBe(false);
    expect(m.autoApplyEnabled).toBe(false);
  });
});

describe('PD-9 Proactive Decision V1 harness (F1–F10)', () => {
  it('runs three Case fixtures and passes acceptance gates', async () => {
    const results = [];
    for (const fixture of PROACTIVE_V1_HARNESS_FIXTURES) {
      const run = await runProactiveDecisionHarnessFixture(fixture);
      results.push(run);
      expect(run.impact.caseId).toBe(fixture.expectedCaseId);
      for (const [k, ok] of Object.entries(run.acceptance)) {
        expect({ fixture: fixture.id, gate: k, ok }).toEqual({
          fixture: fixture.id,
          gate: k,
          ok: true,
        });
      }
    }

    expect(results).toHaveLength(3);
    expect(results.find((r) => r.fixtureId === 'F_FROAD_DIFFICULT')?.recommendedOptionId).not.toBe(
      'OPT_KEEP_ORIGINAL',
    );

    const allEvents = results.flatMap((r) => r.telemetry);
    const counters = reduceProactiveTelemetryCounters(allEvents);
    expect(counters.shown).toBeGreaterThan(0);
    expect(computeProactiveAcceptRate(counters)).toBeGreaterThan(0);
    expect(computeNeptuneTriggerRate(counters)).toBeGreaterThan(0);
    expect(
      computeSilentSuppressRate({
        impactsRequiringDecision: results.length,
        silentSuppressed: counters.silentSuppressed,
      }),
    ).not.toBeUndefined();
  });
});
