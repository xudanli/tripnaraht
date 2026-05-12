import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type { WorldModelPredictionBundle } from '../contracts/predictive-execution.types';
import {
  argmaxTrajectoryUtility,
  expectedTrajectoryUtility,
  predictiveEcpsSelectionFromRollouts,
  trajectoryReplaySupervisionStub,
  trajectoryUtility,
} from './predictive-ecps.util';

function bundle(): WorldModelPredictionBundle {
  return {
    queryId: 'q1',
    trajectories: [
      {
        id: 'tau_low',
        probability: 0.7,
        simulationBudget: { rolloutDepth: 2, branchCount: 1 },
        steps: [{ stepIndex: 0, kind: 'ECPS_EVAL' }],
        predictedReward: 0.5,
        predictedRisk: 0.1,
        predictedLatencyMs: 500,
        predictedEntropy: 0.2,
      },
      {
        id: 'tau_high',
        probability: 0.3,
        simulationBudget: { rolloutDepth: 8, branchCount: 4 },
        steps: [{ stepIndex: 0 }, { stepIndex: 1 }],
        predictedReward: 0.9,
        predictedRisk: 0.4,
        predictedLatencyMs: 8000,
        predictedEntropy: 0.6,
      },
    ],
  };
}

describe('predictive-ecps.util', () => {
  it('scores trajectory with U = reward − penalties', () => {
    const u = trajectoryUtility(bundle().trajectories[0]);
    expect(u.components.rewardTerm).toBeGreaterThan(0);
    expect(u.score).toBeLessThanOrEqual(u.components.rewardTerm);
  });

  it('argmax picks higher-reward trajectory when penalties comparable', () => {
    const b = bundle();
    const r = argmaxTrajectoryUtility(b);
    expect(r.trajectory.id).toBe('tau_high');
  });

  it('expectedTrajectoryUtility blends posteriors', () => {
    const e = expectedTrajectoryUtility(bundle());
    expect(Number.isFinite(e)).toBe(true);
  });

  it('predictiveEcpsSelectionFromRollouts wires winning τ to ECPS decision', () => {
    const sel = predictiveEcpsSelectionFromRollouts({
      bundle: bundle(),
      decisionFromTrajectory: (t): ExecutionDecision => ({
        mode: 'RECOMPUTE',
        kernel: 'REASONING_KERNEL',
        features: {
          intensity: 0.8,
          entropy: t.predictedEntropy,
          determinism: 0.5,
          toolDepth: 'HIGH',
        },
        toolDepth: 'HIGH',
        reuseArtifact: false,
        invalidationScope: 'FULL',
        confidenceGate: 'LOW',
      }),
    });
    expect(sel.winningTrajectoryId).toBe('tau_high');
    expect(sel.decision.features.entropy).toBe(bundle().trajectories[1].predictedEntropy);
  });

  it('replay supervision measures step-count gap', () => {
    const sup = trajectoryReplaySupervisionStub({
      predictedTrajectoryId: 'p',
      observedTraceId: 'o',
      predictedStepCount: 2,
      observedStepCount: 10,
    });
    expect(sup.trajectoryDivergence).toBeGreaterThan(0);
    expect(sup.suggestedWorldModelCorrection).toBe('RECALIBRATE_UNCERTAINTY');
  });
});
