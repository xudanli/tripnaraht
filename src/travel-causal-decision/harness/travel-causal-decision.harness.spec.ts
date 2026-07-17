import {
  assertTravelCausalDecisionComplete,
  CAUSAL_CASE_LOOP_STEPS,
} from './assert-travel-causal-decision.util';
import { listStandardCausalDecisionFixtures } from '../fixtures';
import { listTravelCausalRules } from '../registry/travel-causal-rule.registry';
import { projectCausalDecisionCard } from '../projectors/causal-decision-card.projector';
import {
  toLegacyOutcomeValidationVerdict,
  toOutcomeReconciliationStatus,
} from '../mappers/map-outcome-validation-verdict.util';
import { STANDARD_CAUSAL_CASE_IDS } from '../fixtures/case-ids';
import { runIcelandSelfDriveCausalAnalysis } from '../../trips/causal-runtime/domains/iceland-self-drive-causal.engine';
import { projectIcelandToTravelCausalDecision } from '../projectors/project-iceland-to-travel-causal-decision';
import {
  attachSelectedOption,
  reconcileTravelCausalDecision,
} from '../reconciliation/reconcile-decision-outcome.util';

/**
 * P0 harness — freeze TravelCausalDecision contract + 3 standard cases.
 * Does not yet wire live Decision Runtime; fixtures are the acceptance spine.
 */
describe('TravelCausalDecision contract harness (P0)', () => {
  it('exposes the closed-loop step checklist', () => {
    expect(CAUSAL_CASE_LOOP_STEPS).toEqual([
      'facts',
      'rootCause',
      'propagation',
      'temporalDeadlines',
      'doNothingConsequence',
      'interventions',
      'validation',
      'userSelectionHook',
      'ledgerRefSlot',
      'outcomeReconciliation',
    ]);
  });

  it('registers APPROVED rules for all three standard case tags', () => {
    for (const caseId of Object.values(STANDARD_CAUSAL_CASE_IDS)) {
      const rules = listTravelCausalRules({ caseTag: caseId, reviewStatus: 'APPROVED' });
      expect(rules.length).toBeGreaterThan(0);
    }
  });

  it.each(listStandardCausalDecisionFixtures())(
    'case $caseId is contract-complete',
    ({ decision }) => {
      const report = assertTravelCausalDecisionComplete(decision);
      expect(report.errors).toEqual([]);
      expect(report.ok).toBe(true);
    },
  );

  it('strong-wind fixture carries wall-clock temporal deadlines for the card story', () => {
    const { decision } = listStandardCausalDecisionFixtures().find(
      (f) => f.caseId === STANDARD_CAUSAL_CASE_IDS.STRONG_WIND_APPOINTMENT,
    )!;
    const tf = decision.temporalForecast;
    expect(tf.expectedOnsetAt).toBe('2026-07-17T14:00:00.000Z');
    expect(tf.deteriorationAt).toBe('2026-07-17T15:10:00.000Z');
    expect(tf.interventionDeadline).toBe('2026-07-17T12:35:00.000Z');
    expect(decision.baselineOutcome.metrics?.iceland_miss_prob).toBeCloseTo(0.71);
  });

  it('projects a frontend decision card without exposing raw graphs', () => {
    const { decision } = listStandardCausalDecisionFixtures()[0]!;
    const card = projectCausalDecisionCard(decision);
    expect(card.whatHappened).toContain('强风');
    expect(card.whyItMatters.length).toBeGreaterThanOrEqual(3);
    expect(card.latestActBy).toBe(decision.temporalForecast.interventionDeadline);
    expect(card.recommendation?.title).toBeTruthy();
    expect(card.verifiedChecks.length).toBeGreaterThan(0);
    expect(card.missProbabilityDoNothing).toBeCloseTo(0.71);
  });

  it('maps reconciliation statuses to legacy DecisionOutcomeValidation verdicts', () => {
    expect(toOutcomeReconciliationStatus('PARTIALLY_CONFIRMED')).toBe('PARTIAL');
    expect(toOutcomeReconciliationStatus('REFUTED')).toBe('DISPROVED');
    expect(toLegacyOutcomeValidationVerdict('UNOBSERVABLE')).toBe('INCONCLUSIVE');
  });

  it('live Iceland engine → TravelCausalDecision → select → reconcile loop', () => {
    const assessment = runIcelandSelfDriveCausalAnalysis({
      routeLabel: 'Reykjavik → Vik',
      distanceKm: 180,
      baseDurationMinutes: 130,
      windMps: 20,
      windExposure: 'high',
      appointmentSlackMinutes: 15,
      region: 'south_coast',
    });
    let decision = projectIcelandToTravelCausalDecision({
      tripId: 'trip_harness_live',
      decisionId: 'dec_harness_live',
      assessment,
      schedule: {
        detectedAt: '2026-07-17T09:00:00.000Z',
        plannedDepartureAt: '2026-07-17T12:00:00.000Z',
        checkInDeadlineAt: '2026-07-17T14:30:00.000Z',
        windOnsetAt: '2026-07-17T13:00:00.000Z',
      },
      costImpactDoNothing: 160,
      recoverableStop: {
        activityId: 'act_stop',
        label: '瀑布',
        recoverMinutes: 40,
      },
    });

    expect(assertTravelCausalDecisionComplete(decision).ok).toBe(true);
    decision = attachSelectedOption(decision, decision.recommendation!.optionId);
    const predicted =
      decision.outcome!.predictedOutcome.metrics?.iceland_miss_prob ?? 0.1;
    decision = reconcileTravelCausalDecision(decision, {
      completed: true,
      metrics: { iceland_miss_prob: predicted },
      sources: ['BOOKING_CHECKIN'],
      observedAt: '2026-07-17T15:00:00.000Z',
    });
    expect(decision.outcome?.reconciliation).toBe('CONFIRMED');
  });
});
