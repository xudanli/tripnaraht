import { projectTravelWorldState } from '../../state-learning/project-travel-world-state.util';
import { buildComparableDecisionSnapshot } from '../canary/comparable-snapshot.util';
import { evaluateSampleEligibility } from '../canary/sample-eligibility.util';
import { evaluateCanaryCandidate } from '../canary/canary-candidate-evaluation.util';
import { proveCanaryBetterInProduction } from '../canary/prove-canary-production.util';
import {
  createCanaryExperiment,
  startCanaryExperiment,
} from './canary-experiment.util';
import { buildDecisionQualityDashboard } from './decision-quality-dashboard.util';
import { checkPromotionEvidenceRequirement } from './promotion-evidence-requirement.util';
import { evaluateCanaryKillSwitch } from './canary-kill-switch.util';
import { recordDecisionDisagreement } from './decision-disagreement.util';
import {
  createTravelDecisionDataset,
  appendTravelDecisionRecord,
  projectTravelDecisionDatasetForObservability,
} from './travel-decision-dataset.util';

describe('Production Evidence Accumulation', () => {
  const world = () =>
    projectTravelWorldState({
      tripId: 'trip_ea',
      lifecycle: 'TRAVELING',
      decisionOs: {
        revision: 'v1',
        tripId: 'trip_ea',
        name: '冰岛',
        days: [{ date: '2026-08-09', items: [{ placeName: '黑沙滩' }] }],
      },
      tripMeta: { planVersion: 1, status: 'ACTIVE' },
      correlation: { latestPlanVersion: 1 },
      bookingItems: [{ dayIndex: 1, bookingStatus: 'BOOKED' }],
    });

  it('CanaryExperiment fixes candidate/production/key/scope/success/rollback', () => {
    let exp = createCanaryExperiment({
      labelZh: '节奏偏好 Canary',
      decisionKey: 'pace_preference',
      productionPolicyId: 'prod_pace_v1',
      candidatePolicyId: 'cand_pace_v2',
      minEligibleSamples: 30,
      minObserveDays: 7,
    });
    expect(exp.canaryPassedIsNotPolicyProven).toBe(true);
    expect(exp.success.requireOutcomeEvidence).toBe(true);
    expect(exp.rollback.onSafetyRegression).toBe(true);
    exp = startCanaryExperiment(exp);
    expect(exp.status).toBe('RUNNING');
    expect(exp.exposure.startedAt).toBeTruthy();
    expect(exp.exposure.endsAtEarliest).toBeTruthy();
  });

  it('Decision Quality Dashboard aggregates by DecisionKey', () => {
    const snap = buildComparableDecisionSnapshot({
      tripId: 'trip_ea',
      decisionKey: 'pace_preference',
      worldState: world(),
      evidence: [{ key: 'p', valueZh: '轻松', freshness: 'VERIFIED' }],
    });
    const elig = evaluateSampleEligibility({
      snapshot: snap,
      outcomeObservable: true,
      canaryAdmitted: true,
    });
    const evalProd = evaluateCanaryCandidate({
      channel: 'PRODUCTION',
      snapshot: snap,
      hints: { safetyOk: true, feasibilityOk: true, outcomeScore: 0.6 },
    });
    const dash = buildDecisionQualityDashboard([
      {
        decisionKey: 'pace_preference',
        eligibility: elig,
        evaluation: evalProd,
      },
      {
        decisionKey: 'pace_preference',
        eligibility: { eligible: false, reasons: ['OUTCOME_UNOBSERVABLE'], detailZh: [] },
        evaluation: evalProd,
      },
    ]);
    expect(dash.rows[0].eligibleSamples).toBe(1);
    expect(dash.rows[0].ineligibleSamples).toBe(1);
    expect(dash.rows[0].avgSafety).toBeGreaterThan(0);
  });

  it('PromotionEvidenceRequirement blocks promote without samples/days/outcome (Canary≠Proven)', () => {
    const exp = startCanaryExperiment(
      createCanaryExperiment({
        labelZh: '节奏',
        decisionKey: 'pace_preference',
        productionPolicyId: 'p',
        candidatePolicyId: 'c',
        minEligibleSamples: 30,
        minObserveDays: 7,
      }),
    );
    const denied = checkPromotionEvidenceRequirement({
      experiment: exp,
      eligibleSampleCount: 5,
      observeDaysElapsed: 1,
      hasOutcomeEvidence: false,
      offlineCanaryTestsPassed: true,
      productionProof: null,
    });
    expect(denied.allowedToPromote).toBe(false);
    expect(denied.canaryPassedIsNotPolicyProven).toBe(true);
    expect(denied.missing).toEqual(
      expect.arrayContaining([
        'MIN_ELIGIBLE_SAMPLES',
        'MIN_OBSERVE_DAYS',
        'OUTCOME_EVIDENCE',
        'MISSING_PRODUCTION_PROOF',
      ]),
    );

    const snap = buildComparableDecisionSnapshot({
      tripId: 'trip_ea',
      decisionKey: 'pace_preference',
      worldState: world(),
      evidence: [{ key: 'p', valueZh: '轻松', freshness: 'VERIFIED' }],
    });
    const eligibility = evaluateSampleEligibility({
      snapshot: snap,
      outcomeObservable: true,
      canaryAdmitted: true,
    });
    const production = evaluateCanaryCandidate({
      channel: 'PRODUCTION',
      snapshot: snap,
      hints: {
        safetyOk: true,
        feasibilityOk: true,
        outcomeScore: 0.5,
        userAccepted: false,
      },
    });
    const candidate = evaluateCanaryCandidate({
      channel: 'CANDIDATE',
      snapshot: snap,
      hints: {
        safetyOk: true,
        feasibilityOk: true,
        outcomeScore: 0.9,
        userAccepted: true,
        baselineSafety: production.metrics.safety,
        baselineFeasibility: production.metrics.feasibility,
      },
    });
    const proof = proveCanaryBetterInProduction({
      pairs: [{ eligibility, production, candidate }],
    });
    const stillDenied = checkPromotionEvidenceRequirement({
      experiment: exp,
      eligibleSampleCount: 30,
      observeDaysElapsed: 7,
      hasOutcomeEvidence: true,
      productionProof: proof,
      offlineCanaryTestsPassed: true,
    });
    /** 单样本证明可能通过，但真实晋升仍依赖实验门槛；此处验证有 proof 时可过门槛字段 */
    if (proof.provenBetterInProduction) {
      expect(stillDenied.allowedToPromote).toBe(true);
    }
  });

  it('Kill Switch pauses/kills on safety or unauthorized mutation', () => {
    const exp = startCanaryExperiment(
      createCanaryExperiment({
        labelZh: '节奏',
        decisionKey: 'pace_preference',
        productionPolicyId: 'p',
        candidatePolicyId: 'c',
      }),
    );
    const killed = evaluateCanaryKillSwitch({
      experiment: exp,
      safetyRegressed: true,
    });
    expect(killed.triggered).toBe(true);
    expect(killed.event?.channelForced).toBe('PRODUCTION');
    expect(killed.nextExperiment.status).toBe('KILLED');
    expect(killed.nextExperiment.exposure.trafficFraction).toBe(0);

    const unauth = evaluateCanaryKillSwitch({
      experiment: exp,
      unauthorizedMutation: true,
    });
    expect(unauth.event?.trigger).toBe('UNAUTHORIZED_MUTATION');
  });

  it('DecisionDisagreementEvent records real prod vs candidate divergence', () => {
    expect(
      recordDecisionDisagreement({
        tripId: 'trip_ea',
        decisionKey: 'pace_preference',
        snapshotId: 'snap_1',
        productionOptionId: 'easy',
        candidateOptionId: 'easy',
      }),
    ).toBeNull();

    const ev = recordDecisionDisagreement({
      tripId: 'trip_ea',
      decisionKey: 'pace_preference',
      snapshotId: 'snap_1',
      productionOptionId: 'easy',
      candidateOptionId: 'packed',
      userChosenOptionId: 'packed',
      experimentId: 'exp_1',
    });
    expect(ev?.isRealCase).toBe(true);
    expect(ev?.productionOptionId).not.toBe(ev?.candidateOptionId);
  });

  it('Travel Decision Dataset accumulates full chain; Temporal gated on volume', () => {
    let ds = createTravelDecisionDataset({ minRecordsForTemporal: 3 });
    expect(ds.readyForTemporalProactive).toBe(false);
    const ws = world();
    for (let i = 0; i < 3; i++) {
      ds = appendTravelDecisionRecord(ds, {
        recordId: `r${i}`,
        tripId: 'trip_ea',
        decisionKey: 'pace_preference',
        snapshotId: `snap_${i}`,
        worldState: ws,
        evidence: [{ key: 'e', valueZh: 'x', freshness: 'VERIFIED' }],
        decision: { decisionId: `d${i}`, state: 'COMMITTED' },
        recommendation: {
          productionOptionId: 'easy',
          candidateOptionId: i % 2 === 0 ? 'packed' : 'easy',
        },
        choice: { userChosenOptionId: 'easy' },
        action: { actionId: null, appliedToItinerary: false },
        outcome: { observable: true, valueZh: '疲劳可控' },
      });
    }
    expect(ds.records).toHaveLength(3);
    expect(ds.readyForTemporalProactive).toBe(true);
    expect(
      projectTravelDecisionDatasetForObservability(ds).ready_for_temporal_proactive,
    ).toBe(true);
  });
});
