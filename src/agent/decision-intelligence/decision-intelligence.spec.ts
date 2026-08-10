import { buildOutcomeReconciliation } from '../state-learning/outcome-reconciliation.util';
import { emitLearningSignal } from '../state-learning/hardening/learning-signal.registry';
import { compileAgentTaskContract } from '../harness/compile-agent-task-contract.util';
import {
  evaluateDecisionFromReconciliation,
} from './decision-evaluation.util';
import { attributeOutcome } from './outcome-attribution.util';
import { buildAdaptiveShadowRecommendation } from './adaptive-shadow-recommendation.util';
import {
  runL1ContractGolden,
  runL2ScenarioBenchmark,
  runL3OutcomeBenchmark,
} from './benchmark-l1-l2-l3.util';
import {
  assertLearningCannotMutateHardConstraint,
  assertLearningCannotMutateHardConstraintOrThrow,
} from './hard-constraint-guard.util';
import { createPolicyCandidate } from './policy-candidate.types';
import {
  startPromotionPipeline,
  advancePromotionStage,
} from './promotion-pipeline.util';
import { proveCandidateBetterThanProduction } from './compare-candidate-vs-production.util';

describe('Decision Intelligence Validation', () => {
  it('DecisionEvaluation separates prediction from decision', () => {
    const recon = buildOutcomeReconciliation({
      kind: 'ARRIVAL_TIME',
      tripId: 't1',
      predictedZh: '+10min',
      observedZh: '+12min',
      deltaZh: '+2min',
    });
    const ev = evaluateDecisionFromReconciliation({
      reconciliation: recon,
      productionDecisionZh: '继续前往冰河湖',
    });
    expect(ev.predictionIsNotDecision).toBe(true);
    expect(ev.counterfactualIsNotObserved).toBe(true);
    expect(ev.predictionZh).toBe('+10min');
    expect(ev.productionDecisionZh).toBe('继续前往冰河湖');
    expect(ev.grade).toBe('GOOD');
  });

  it('Outcome Attribution covers four kinds and excludes counterfactual as observed', () => {
    const recon = buildOutcomeReconciliation({
      kind: 'RISK',
      tripId: 't1',
      predictedZh: '通行',
      observedZh: '临时封闭',
    });
    const attr = attributeOutcome({
      reconciliation: recon,
      hints: {
        externalShock: true,
        counterfactualZh: '若未封闭本可抵达',
      },
    });
    expect(attr.primary).toBe('EXTERNAL_ENVIRONMENT_CHANGE');
    expect(attr.counterfactualIsNotObserved).toBe(true);
    expect(attr.counterfactualNoteZh).toMatch(/若未封闭/);

    const userAttr = attributeOutcome({
      reconciliation: recon,
      hints: { userChangedPlan: true },
    });
    expect(userAttr.primary).toBe('USER_BEHAVIOR_CHANGE');

    const intervention = attributeOutcome({
      reconciliation: recon,
      hints: { interventionApplied: true, interventionImprovedOutcome: true },
    });
    expect(intervention.primary).toBe('INTERVENTION_SUCCESS');
  });

  it('Adaptive Shadow Recommendation only affects shadow channel', () => {
    const production = {
      channel: 'PRODUCTION' as const,
      selectedOptionId: 'a',
      options: [
        { optionId: 'a', labelZh: '两驱', score: 0.7 },
        { optionId: 'b', labelZh: '四驱', score: 0.6 },
      ],
    };
    const signal = emitLearningSignal({
      kind: 'RISK_BIAS',
      summaryZh: '偏好四驱',
      payload: { prefer_option_id: 'b' },
    });
    const { production: prodOut, shadow } = buildAdaptiveShadowRecommendation({
      production,
      signals: [signal],
    });
    expect(prodOut.selectedOptionId).toBe('a');
    expect(shadow.selectedOptionId).toBe('b');
    expect(shadow.productionUnchanged).toBe(true);
    expect(shadow.policyMutationDenied).toBe(true);
  });

  it('L1/L2/L3 benchmarks run', () => {
    const q = compileAgentTaskContract({
      message: '哪一天没住宿',
      turnId: 'di-l1',
      tripId: 't1',
    });
    const l1 = runL1ContractGolden({
      cases: [
        {
          caseId: 'q01',
          contract: q,
          mustAllow: ['QUERY_ACCOMMODATION', 'ANSWER'],
          mustDeny: ['APPLY', 'PLAN'],
          mustNotAllowFullPlanning: true,
        },
      ],
    });
    expect(l1.passRate).toBe(1);

    const l2 = runL2ScenarioBenchmark({
      cases: [
        {
          caseId: 's1',
          scenarioZh: '高地天气差选四驱',
          productionOptionId: '4wd',
          expectedOptionId: '4wd',
        },
      ],
    });
    expect(l2.passed).toBe(1);

    const recon = buildOutcomeReconciliation({
      kind: 'FATIGUE',
      tripId: 't1',
      predictedZh: 'MEDIUM',
      observedZh: 'MEDIUM',
    });
    const ev = evaluateDecisionFromReconciliation({ reconciliation: recon });
    const l3 = runL3OutcomeBenchmark({ evaluations: [ev] });
    expect(l3.passRate).toBe(1);
  });

  it('Hard Constraint / Gate BLOCK / Safety cannot be learning-mutated', () => {
    expect(assertLearningCannotMutateHardConstraint('GATE_BLOCK').ok).toBe(false);
    expect(assertLearningCannotMutateHardConstraint('HARD_CONSTRAINT').ok).toBe(
      false,
    );
    expect(() =>
      assertLearningCannotMutateHardConstraintOrThrow('SAFETY_RULE'),
    ).toThrow(/HardConstraint/);
    expect(() =>
      createPolicyCandidate({
        labelZh: '坏候选',
        shadowAdjustments: { gate_block_override: true },
      }),
    ).toThrow(/forbidden_adjustment_key/);
  });

  it('Promotion Pipeline requires proof candidate beats production (DoD)', () => {
    const candidate = createPolicyCandidate({
      labelZh: '影子偏好四驱',
      sourceSignalIds: ['sig_1'],
      shadowAdjustments: { prefer_option_id: 'b' },
    });
    let pipe = startPromotionPipeline(candidate);
    let cand = candidate;

    ({ state: pipe, candidate: cand } = advancePromotionStage({
      state: pipe,
      candidate: cand,
      to: 'SHADOW',
    }));
    expect(cand.status).toBe('SHADOW');

    ({ state: pipe, candidate: cand } = advancePromotionStage({
      state: pipe,
      candidate: cand,
      to: 'REPLAY',
    }));

    const l3 = runL3OutcomeBenchmark({
      evaluations: [
        evaluateDecisionFromReconciliation({
          reconciliation: buildOutcomeReconciliation({
            kind: 'RISK',
            tripId: 't1',
            predictedZh: '通行',
            observedZh: '通行',
          }),
        }),
      ],
    });
    ({ state: pipe, candidate: cand } = advancePromotionStage({
      state: pipe,
      candidate: cand,
      to: 'BENCHMARK',
      benchmark: l3,
    }));
    expect(cand.status).toBe('BENCHMARKED');

    const production = {
      channel: 'PRODUCTION' as const,
      selectedOptionId: 'a',
      options: [
        { optionId: 'a', labelZh: '两驱', score: 0.7 },
        { optionId: 'b', labelZh: '四驱', score: 0.55 },
      ],
    };
    const shadow = buildAdaptiveShadowRecommendation({
      production,
      signals: [
        emitLearningSignal({
          kind: 'RISK_BIAS',
          summaryZh: '四驱',
          payload: { prefer_option_id: 'b' },
        }),
      ],
    }).shadow;

    const proofFail = proveCandidateBetterThanProduction({
      production,
      shadow,
      observedEvaluations: [
        evaluateDecisionFromReconciliation({
          reconciliation: buildOutcomeReconciliation({
            kind: 'RISK',
            tripId: 't1',
            predictedZh: '通行',
            observedZh: '通行',
          }),
        }),
      ],
      observedChosenOptionId: 'a',
      l3,
    });

    const blocked = advancePromotionStage({
      state: pipe,
      candidate: cand,
      to: 'APPROVAL',
      humanApproved: true,
      proof: proofFail,
    });
    /** 若未能证明更优则拒绝 */
    if (!proofFail.candidateBetterThanProduction) {
      expect(blocked.state.blocked?.reason).toMatch(/not_proven_better/);
    }

    const proofWin = proveCandidateBetterThanProduction({
      production,
      shadow,
      observedEvaluations: [
        evaluateDecisionFromReconciliation({
          reconciliation: buildOutcomeReconciliation({
            kind: 'RISK',
            tripId: 't1',
            predictedZh: '通行',
            observedZh: '通行',
          }),
        }),
      ],
      observedChosenOptionId: 'b',
      l3,
    });
    expect(proofWin.candidateBetterThanProduction).toBe(true);
    expect(proofWin.counterfactualExcluded).toBe(true);

    const approved = advancePromotionStage({
      state: pipe,
      candidate: cand,
      to: 'APPROVAL',
      humanApproved: true,
      proof: proofWin,
    });
    expect(approved.candidate.status).toBe('APPROVED');

    const versioned = advancePromotionStage({
      state: approved.state,
      candidate: approved.candidate,
      to: 'VERSION',
    });
    const canary = advancePromotionStage({
      state: versioned.state,
      candidate: versioned.candidate,
      to: 'CANARY',
    });
    expect(canary.candidate.status).toBe('CANARY');
    expect(canary.state.stage).toBe('CANARY');
  });
});
