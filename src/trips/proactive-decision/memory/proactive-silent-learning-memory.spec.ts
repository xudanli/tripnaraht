import { MemoryLedgerStore } from '../../../travel-memory/ledger/memory-ledger.store';
import { TravelMemoryRuntimeService } from '../../../travel-memory/runtime/travel-memory-runtime.service';
import { buildProactiveImpactFromWeather } from '../adapters/build-proactive-impact.util';
import { planLensesForProactiveCase } from '../lenses/evaluate-lens-activation.util';
import { synthesizeProactiveRecommendation } from '../synthesis/synthesize-proactive-recommendation.util';
import { evaluateProactiveIntervention } from '../intervention/evaluate-proactive-intervention.util';
import { buildProactiveDecisionTrace } from '../trace/build-proactive-decision-trace.util';
import {
  ingestProactiveSilentLearningIntoMemoryLedger,
  listProactiveSilentLearningEvents,
  PROACTIVE_SILENT_MEMORY_PREDICATE,
} from './ingest-proactive-silent-learning.util';
import {
  computeSilentOutcomeReviewStats,
  evaluateSilentLearningOutcomeHeuristic,
  reviewSilentLearningMemoryEvent,
} from './proactive-silent-outcome-review.util';
import {
  isProactiveSilentLearningMemoryEnabled,
  ProactiveSilentLearningMemoryService,
} from './proactive-silent-learning-memory.service';

describe('Phase 4 P1 — Silent Learning → Travel Memory', () => {
  function buildSilentPath(threshold = 0.99) {
    const impact = buildProactiveImpactFromWeather({
      tripId: 'trip_silent',
      signalEventId: 'evt_silent_wind',
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
    if (!syn.ok) throw new Error('syn');
    const intervention = evaluateProactiveIntervention({
      impact,
      synthesis: syn.synthesis,
      decisionProblemId: 'problem_silent',
      attentionCost: 0.05,
      threshold,
    });
    const decisionTrace = buildProactiveDecisionTrace({
      impact,
      lens,
      synthesis: syn.synthesis,
      intervention,
      decisionProblemId: 'problem_silent',
    });
    return { impact, syn, intervention, decisionTrace };
  }

  it('ingests below-threshold silence into Travel Memory ledger', () => {
    const { intervention, decisionTrace, syn } = buildSilentPath(0.99);
    expect(intervention.gate).toBe('SILENT_LEARNING');
    expect(intervention.silentLearning?.memoryHook).toBe(
      'TRAVEL_MEMORY_PENDING',
    );

    const ledger = new MemoryLedgerStore();
    const result = ingestProactiveSilentLearningIntoMemoryLedger({
      ledger,
      silentLearning: intervention.silentLearning!,
      decisionProblemId: 'problem_silent',
      recommendedOptionId: syn.synthesis.recommended.optionId,
      decisionTraceReplay: {
        signal: decisionTrace.signal.label,
        intervention: { value: decisionTrace.intervention.value },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.memoryHook).toBe('TRAVEL_MEMORY_WRITTEN');
    expect(result.event.predicate).toBe(PROACTIVE_SILENT_MEMORY_PREDICATE);
    expect(result.event.status).toBe('CANDIDATE');

    const listed = listProactiveSilentLearningEvents(ledger, 'trip_silent');
    expect(listed).toHaveLength(1);

    const dup = ingestProactiveSilentLearningIntoMemoryLedger({
      ledger,
      silentLearning: intervention.silentLearning!,
      decisionProblemId: 'problem_silent',
    });
    expect(dup.ok).toBe(true);
    if (dup.ok) expect(dup.duplicate).toBe(true);
    expect(listProactiveSilentLearningEvents(ledger, 'trip_silent')).toHaveLength(
      1,
    );
  });

  it('Outcome Review flags should-have-notified on user chase question', () => {
    const { intervention } = buildSilentPath(0.99);
    const ledger = new MemoryLedgerStore();
    const ingested = ingestProactiveSilentLearningIntoMemoryLedger({
      ledger,
      silentLearning: intervention.silentLearning!,
      decisionProblemId: 'problem_silent',
    });
    expect(ingested.ok).toBe(true);
    if (!ingested.ok) return;

    const review = evaluateSilentLearningOutcomeHeuristic({
      silent: intervention.silentLearning!,
      memoryEventId: ingested.event.memoryEventId,
      userAskedSameQuestionWithinWindow: true,
    });
    expect(review.verdict).toBe('SHOULD_HAVE_NOTIFIED');

    const okSilent = evaluateSilentLearningOutcomeHeuristic({
      silent: intervention.silentLearning!,
      memoryEventId: ingested.event.memoryEventId,
      userAskedSameQuestionWithinWindow: false,
    });
    expect(okSilent.verdict).toBe('CORRECTLY_SILENT');

    const fromEvent = reviewSilentLearningMemoryEvent(ingested.event, {
      regretReported: true,
    });
    expect(fromEvent?.verdict).toBe('SHOULD_HAVE_NOTIFIED');

    const stats = computeSilentOutcomeReviewStats([review, okSilent]);
    expect(stats.falseNegativeRate).toBe(0.5);
    expect(stats.shouldHaveNotified).toBe(1);
  });

  it('Nest service writes via TravelMemoryRuntime when flag on', () => {
    const { intervention, decisionTrace, syn } = buildSilentPath(0.99);
    const runtime = new TravelMemoryRuntimeService();
    const svc = new ProactiveSilentLearningMemoryService(runtime);

    expect(
      isProactiveSilentLearningMemoryEnabled({
        PROACTIVE_DECISION_V1_ENABLED: '1',
      }),
    ).toBe(true);

    const out = svc.ingest({
      silentLearning: intervention.silentLearning!,
      decisionProblemId: 'problem_silent',
      recommendedOptionId: syn.synthesis.recommended.optionId,
      decisionTrace,
      env: { PROACTIVE_DECISION_V1_ENABLED: '1' },
    });
    expect(out.ok).toBe(true);
    expect(out.silentLearning.memoryHook).toBe('TRAVEL_MEMORY_WRITTEN');
    expect(out.silentLearning.memoryEventId).toBeTruthy();
    expect(
      listProactiveSilentLearningEvents(runtime.getLedger(), 'trip_silent'),
    ).toHaveLength(1);
  });
});
