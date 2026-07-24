import { runIcelandSelfDriveCausalAnalysis } from '../../trips/causal-runtime/domains/iceland-self-drive-causal.engine';
import { assertTravelCausalDecisionComplete } from '../harness/assert-travel-causal-decision.util';
import { projectCausalDecisionCard } from './causal-decision-card.projector';
import { projectIcelandToTravelCausalDecision } from './project-iceland-to-travel-causal-decision';
import {
  attachSelectedOption,
  reconcileTravelCausalDecision,
} from '../reconciliation/reconcile-decision-outcome.util';
import { buildIcelandTemporalImpact } from './iceland-temporal-impact.util';

describe('projectIcelandToTravelCausalDecision (live path)', () => {
  const schedule = {
    detectedAt: '2026-07-17T09:40:00.000Z',
    plannedDepartureAt: '2026-07-17T13:00:00.000Z',
    checkInDeadlineAt: '2026-07-17T15:30:00.000Z',
    windOnsetAt: '2026-07-17T14:00:00.000Z',
    decisionLeadMinutes: 15,
  };

  function buildAssessment() {
    return runIcelandSelfDriveCausalAnalysis({
      routeLabel: 'Reykjavik → 冰川徒步集合点',
      distanceKm: 190,
      baseDurationMinutes: 130,
      windMps: 22,
      windExposure: 'high',
      appointmentSlackMinutes: 20,
      region: 'south_coast',
      vehicleClass: '4WD',
    });
  }

  it('projects a contract-complete TravelCausalDecision with temporal deadlines', () => {
    const assessment = buildAssessment();
    const decision = projectIcelandToTravelCausalDecision({
      tripId: 'trip_live_wind',
      decisionId: 'dec_live_wind',
      assessment,
      schedule,
      activityLabel: '冰川徒步',
      costImpactDoNothing: 160,
      recoverableStop: {
        activityId: 'act_waterfall',
        label: '中途瀑布',
        recoverMinutes: 45,
      },
      worldStateVersion: 'ws_live_1',
      canonicalTraceId: 'trace_live_1',
    });

    const report = assertTravelCausalDecisionComplete(decision);
    expect(report.errors).toEqual([]);
    expect(decision.temporalForecast.expectedOnsetAt).toBe(schedule.windOnsetAt);
    expect(decision.temporalForecast.interventionDeadline).toBeTruthy();
    expect(decision.temporalForecast.deteriorationAt).toBeTruthy();
    expect(decision.baselineOutcome.metrics?.iceland_miss_prob).toBeGreaterThan(0.2);
    expect(decision.interventions.length).toBeGreaterThanOrEqual(2);
    expect(decision.outcome?.reconciliation).toBe('PENDING');
    expect(decision.ruleVersion).toContain('is.wind.gust_reduces_speed');
  });

  it('card projection surfaces deadline and do-nothing miss probability', () => {
    const decision = projectIcelandToTravelCausalDecision({
      tripId: 'trip_live_wind',
      decisionId: 'dec_live_wind',
      assessment: buildAssessment(),
      schedule,
      activityLabel: '冰川徒步',
      costImpactDoNothing: 160,
    });
    const card = projectCausalDecisionCard(decision);
    expect(card.latestActBy).toBe(decision.temporalForecast.interventionDeadline);
    expect(card.missProbabilityDoNothing).toBeGreaterThan(0.2);
    expect(card.whyItMatters.length).toBeGreaterThanOrEqual(3);
  });

  it('selection + reconcile moves PENDING → CONFIRMED when actuals align', () => {
    let decision = projectIcelandToTravelCausalDecision({
      tripId: 'trip_live_wind',
      decisionId: 'dec_live_wind',
      assessment: buildAssessment(),
      schedule,
    });
    const optionId = decision.recommendation!.optionId;
    decision = attachSelectedOption(decision, optionId);
    expect(decision.outcome?.selectedOptionId).toBe(optionId);
    expect(decision.outcome?.reconciliation).toBe('PENDING');

    const predictedMiss =
      decision.outcome!.predictedOutcome.metrics?.iceland_miss_prob ??
      1 - (decision.outcome!.predictedOutcome.completionProbability ?? 0);

    decision = reconcileTravelCausalDecision(decision, {
      completed: predictedMiss < 0.25,
      observedAt: '2026-07-17T16:00:00.000Z',
      sources: ['BOOKING_CHECKIN'],
      metrics: { iceland_miss_prob: predictedMiss },
    });

    expect(decision.outcome?.reconciliation).toBe('CONFIRMED');
    expect(decision.outcome?.reconciledAt).toBeTruthy();
  });

  it('reconcile DISPROVED when actual miss far from prediction', () => {
    const mild = runIcelandSelfDriveCausalAnalysis({
      routeLabel: 'Reykjavik → 冰川徒步集合点',
      distanceKm: 120,
      baseDurationMinutes: 90,
      windMps: 14,
      windExposure: 'high',
      appointmentSlackMinutes: 35,
      region: 'south_coast',
    });
    let decision = projectIcelandToTravelCausalDecision({
      tripId: 'trip_live_wind',
      decisionId: 'dec_live_wind',
      assessment: mild,
      schedule,
      recoverableStop: {
        activityId: 'act_waterfall',
        label: '中途瀑布',
        recoverMinutes: 50,
      },
    });
    decision = attachSelectedOption(decision, decision.recommendation!.optionId);
    expect(decision.outcome!.predictedOutcome.completionProbability!).toBeGreaterThan(0.65);

    decision = reconcileTravelCausalDecision(decision, {
      completed: false,
      metrics: { iceland_miss_prob: 0.95 },
      sources: ['BOOKING_STATUS'],
      observedAt: '2026-07-17T16:00:00.000Z',
    });
    expect(decision.outcome?.reconciliation).toBe('DISPROVED');
  });

  it('temporal impact places deadline before required early departure', () => {
    const assessment = buildAssessment();
    const tf = buildIcelandTemporalImpact(assessment, schedule);
    expect(new Date(tf.interventionDeadline!).getTime()).toBeLessThanOrEqual(
      new Date(schedule.plannedDepartureAt).getTime(),
    );
    expect(tf.assumptions.length).toBeGreaterThanOrEqual(3);
  });
});
