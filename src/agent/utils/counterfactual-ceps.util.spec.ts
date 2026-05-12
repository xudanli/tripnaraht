import type {
  CounterfactualGeneratorBundle,
  CounterfactualWorld,
} from '../contracts/counterfactual-execution.types';
import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import { trajectoryUtility } from './predictive-ecps.util';
import {
  argmaxCounterfactualDelta,
  causalConsistencyReplayStub,
  counterfactualEcpsSelection,
  deltaUtilityVersusBaseline,
} from './counterfactual-ceps.util';

function tf(id: string, reward: number, risk: number): CounterfactualWorld {
  return {
    id: `w_${id}`,
    interventionId: id,
    probability: 0.25,
    simulationBudget: { rolloutDepth: 4, branchCount: 2 },
    steps: [{ stepIndex: 0 }],
    predictedReward: reward,
    predictedRisk: risk,
    predictedLatencyMs: 2000,
    predictedEntropy: 0.3,
    interventionComplexity: { causalEdgeCount: id === 'a_low' ? 1 : 4 },
  };
}

function bundle(): CounterfactualGeneratorBundle {
  return {
    queryId: 'cf1',
    causalModelVersion: 'scm_stub/v0',
    baselineWorld: {
      id: 'baseline',
      probability: 1,
      simulationBudget: { rolloutDepth: 2, branchCount: 1 },
      steps: [],
      predictedReward: 0.4,
      predictedRisk: 0.05,
      predictedLatencyMs: 800,
      predictedEntropy: 0.15,
    },
    intervenedWorlds: [
      tf('a_low', 0.45, 0.06),
      tf('a_high', 0.85, 0.35),
    ],
  };
}

describe('counterfactual-ceps.util', () => {
  it('deltaUtilityVersusBaseline matches score difference', () => {
    const b = bundle();
    const d = deltaUtilityVersusBaseline(b.intervenedWorlds[0], b.baselineWorld);
    const ub = trajectoryUtility(b.baselineWorld).score;
    const ui = trajectoryUtility(b.intervenedWorlds[0]).score;
    expect(d).toBeCloseTo(ui - ub, 5);
  });

  it('argmaxCounterfactualDelta picks highest uplift', () => {
    const r = argmaxCounterfactualDelta(bundle());
    expect(r.world.interventionId).toBe('a_high');
    expect(r.deltaUtility).toBeGreaterThan(0);
  });

  it('counterfactualEcpsSelection wires decision from winning world', () => {
    const sel = counterfactualEcpsSelection({
      bundle: bundle(),
      decisionFromIntervenedWorld: (w): ExecutionDecision => ({
        mode: 'RECOMPUTE',
        kernel: 'REASONING_KERNEL',
        features: {
          intensity: 0.85,
          entropy: w.predictedEntropy,
          determinism: 0.42,
          toolDepth: 'HIGH',
        },
        toolDepth: 'HIGH',
        reuseArtifact: false,
        invalidationScope: 'FULL',
        confidenceGate: 'LOW',
      }),
    });
    expect(sel.winningInterventionId).toBe('a_high');
    expect(sel.deltaUtility).toBeGreaterThan(0);
    expect(sel.decision.features.entropy).toBe(bundle().intervenedWorlds[1].predictedEntropy);
  });

  it('causalConsistencyReplayStub flags large drift', () => {
    const v = causalConsistencyReplayStub({
      interventionId: 'a',
      predictedUtilityScore: 0.9,
      observedUtilityProxy: 0.2,
    });
    expect(v.suggestedCalibration).toBe('MODEL_DRIFT');
  });
});
