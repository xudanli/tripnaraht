import { projectTravelWorldState } from '../../state-learning/project-travel-world-state.util';
import {
  createDecisionCanaryController,
  admitDecisionCanary,
  FIRST_BATCH_LOW_RISK_DECISION_KEYS,
} from './decision-canary-controller.util';
import { buildComparableDecisionSnapshot } from './comparable-snapshot.util';
import { evaluateSampleEligibility } from './sample-eligibility.util';
import { buildDecisionRegret } from './decision-regret.util';
import { evaluateCanaryCandidate } from './canary-candidate-evaluation.util';
import { proveCanaryBetterInProduction } from './prove-canary-production.util';

describe('Production Decision Canary', () => {
  const richWorld = () =>
    projectTravelWorldState({
      tripId: 'trip_canary',
      lifecycle: 'TRAVELING',
      decisionOs: {
        revision: 'v1',
        tripId: 'trip_canary',
        name: '冰岛',
        destination: 'IS',
        days: [{ date: '2026-08-08', items: [{ placeName: '维克' }] }],
      },
      tripMeta: { planVersion: 2, status: 'ACTIVE' },
      partyProfile: { party_total: 2, fitness_level: 'medium' },
      missingLodgingDays: [],
      bookingItems: [{ dayIndex: 1, placeName: '维克', bookingStatus: 'BOOKED' }],
      correlation: { latestPlanVersion: 2, latestTurnId: 'turn_c' },
    });

  it('Canary Controller scopes by DecisionKey / Risk; high safety stays Production-only', () => {
    const controller = createDecisionCanaryController({
      trafficFraction: 1,
      maxRiskLevel: 'LOW',
    });
    expect(FIRST_BATCH_LOW_RISK_DECISION_KEYS.length).toBeGreaterThan(0);

    const low = admitDecisionCanary({
      controller,
      decisionKey: 'pace_preference',
      tripId: 'trip_canary',
      lifecycle: 'TRAVELING',
      trafficBucket: 0,
    });
    expect(low.allowed).toBe(true);
    expect(low.channel).toBe('CANARY_ELIGIBLE');

    const high = admitDecisionCanary({
      controller,
      decisionKey: 'vehicle_drive',
      tripId: 'trip_canary',
      lifecycle: 'TRAVELING',
      trafficBucket: 0,
    });
    expect(high.allowed).toBe(false);
    expect(high.reason).toBe('high_safety_decision_production_only');
  });

  it('Production and Candidate share the same WorldState+Evidence snapshot', () => {
    const snap = buildComparableDecisionSnapshot({
      tripId: 'trip_canary',
      decisionKey: 'pace_preference',
      worldState: richWorld(),
      evidence: [
        { key: 'pace', valueZh: '轻松', freshness: 'VERIFIED', source: 'user' },
      ],
    });
    expect(snap.sharedByProductionAndCandidate).toBe(true);
    expect(snap.offlineBetterIsNotProductionBetter).toBe(true);

    const prod = evaluateCanaryCandidate({
      channel: 'PRODUCTION',
      snapshot: snap,
      hints: { safetyOk: true, feasibilityOk: true, outcomeScore: 0.6 },
    });
    const cand = evaluateCanaryCandidate({
      channel: 'CANDIDATE',
      snapshot: snap,
      hints: {
        safetyOk: true,
        feasibilityOk: true,
        outcomeScore: 0.8,
        baselineSafety: prod.metrics.safety,
        baselineFeasibility: prod.metrics.feasibility,
      },
    });
    expect(prod.snapshotId).toBe(cand.snapshotId);
    expect(cand.metrics.safety).toBeDefined();
    expect(cand.metrics.regret).toBeDefined();
    expect(cand.metrics.latency).toBeDefined();
    expect(cand.metrics.cost).toBeDefined();
  });

  it('DataQualityGate excludes low-quality / no-evidence / unobservable outcome', () => {
    const goodSnap = buildComparableDecisionSnapshot({
      tripId: 'trip_canary',
      decisionKey: 'pace_preference',
      worldState: richWorld(),
      evidence: [
        { key: 'pref', valueZh: '轻松', freshness: 'VERIFIED' },
      ],
    });
    expect(
      evaluateSampleEligibility({
        snapshot: goodSnap,
        outcomeObservable: true,
        canaryAdmitted: true,
      }).eligible,
    ).toBe(true);

    const badEvidence = buildComparableDecisionSnapshot({
      tripId: 'trip_canary',
      decisionKey: 'pace_preference',
      worldState: richWorld(),
      evidence: [],
    });
    const noEv = evaluateSampleEligibility({
      snapshot: badEvidence,
      outcomeObservable: true,
      canaryAdmitted: true,
    });
    expect(noEv.eligible).toBe(false);
    expect(noEv.reasons).toContain('EVIDENCE_INSUFFICIENT');

    const noOutcome = evaluateSampleEligibility({
      snapshot: goodSnap,
      outcomeObservable: false,
      canaryAdmitted: true,
    });
    expect(noOutcome.reasons).toContain('OUTCOME_UNOBSERVABLE');
  });

  it('DecisionRegret captures rollback / replan / user correction', () => {
    const r = buildDecisionRegret({
      tripId: 'trip_canary',
      decisionKey: 'pace_preference',
      signal: 'USER_CORRECTION',
      noteZh: '用户改回轻松节奏',
    });
    expect(r.isPostHocObserved).toBe(true);
    expect(r.regretScore).toBeGreaterThan(0);
    expect(
      buildDecisionRegret({
        tripId: 't',
        decisionKey: 'pace_preference',
        signal: 'ROLLBACK',
      }).regretScore,
    ).toBeGreaterThan(0.8);
  });

  it('DoD: prove better on Eligible Samples with zero Safety/Feasibility regression', () => {
    const snap = buildComparableDecisionSnapshot({
      tripId: 'trip_canary',
      decisionKey: 'pace_preference',
      worldState: richWorld(),
      evidence: [
        { key: 'pref', valueZh: '轻松', freshness: 'VERIFIED' },
      ],
    });
    const eligibility = evaluateSampleEligibility({
      snapshot: snap,
      outcomeObservable: true,
      canaryAdmitted: true,
    });
    expect(eligibility.eligible).toBe(true);

    const production = evaluateCanaryCandidate({
      channel: 'PRODUCTION',
      snapshot: snap,
      hints: {
        safetyOk: true,
        feasibilityOk: true,
        outcomeScore: 0.55,
        userAccepted: false,
        userCorrected: true,
        regret: buildDecisionRegret({
          tripId: 'trip_canary',
          decisionKey: 'pace_preference',
          signal: 'USER_CORRECTION',
        }),
        latencyMs: 1200,
        costUsd: 0.05,
      },
    });
    const candidate = evaluateCanaryCandidate({
      channel: 'CANDIDATE',
      snapshot: snap,
      hints: {
        safetyOk: true,
        feasibilityOk: true,
        outcomeScore: 0.85,
        userAccepted: true,
        userCorrected: false,
        regret: buildDecisionRegret({
          tripId: 'trip_canary',
          decisionKey: 'pace_preference',
          signal: 'NONE',
        }),
        latencyMs: 900,
        costUsd: 0.04,
        baselineSafety: production.metrics.safety,
        baselineFeasibility: production.metrics.feasibility,
      },
    });
    expect(candidate.safetyRegressed).toBe(false);
    expect(candidate.feasibilityRegressed).toBe(false);

    const proof = proveCanaryBetterInProduction({
      pairs: [{ eligibility, production, candidate }],
    });
    expect(proof.offlineBetterIsNotProductionBetter).toBe(true);
    expect(proof.safetyFeasibilityZeroRegression).toBe(true);
    expect(proof.eligibleSampleCount).toBe(1);
    expect(proof.provenBetterInProduction).toBe(true);

    /** 有 Safety 退化则不得证明更优 */
    const regressed = evaluateCanaryCandidate({
      channel: 'CANDIDATE',
      snapshot: snap,
      hints: {
        safetyOk: false,
        feasibilityOk: true,
        outcomeScore: 0.99,
        userAccepted: true,
        baselineSafety: production.metrics.safety,
        baselineFeasibility: production.metrics.feasibility,
      },
    });
    const failProof = proveCanaryBetterInProduction({
      pairs: [{ eligibility, production, candidate: regressed }],
    });
    expect(failProof.safetyFeasibilityZeroRegression).toBe(false);
    expect(failProof.provenBetterInProduction).toBe(false);
  });
});
