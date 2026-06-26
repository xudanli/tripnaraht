import type { DecisionState } from '../decision-state.types';
import { applyPatentFeedbackLearning } from './patent-feedback-learning.util';

describe('applyPatentFeedbackLearning', () => {
  const baseDso = (): DecisionState =>
    ({
      userIntent: { preferences: { activityWeights: { spaActivities: 0.1 } } },
      optimizationHints: { selectedPlanId: 'plan_c_indoor_spa' },
      feedback: { accepted: true, satisfactionScore: 4.8 },
      systemState: { requestId: 'r1', version: 8 },
    }) as DecisionState;

  it('no-ops when flag disabled', () => {
    const prev = process.env.DECISION_OS_PATENT_FEEDBACK_LEARNING;
    delete process.env.DECISION_OS_PATENT_FEEDBACK_LEARNING;
    try {
      const { patch } = applyPatentFeedbackLearning(baseDso());
      expect(Object.keys(patch)).toHaveLength(0);
    } finally {
      if (prev !== undefined) process.env.DECISION_OS_PATENT_FEEDBACK_LEARNING = prev;
    }
  });

  it('increments spa preference and records Lyapunov audit when flag enabled', () => {
    const prev = process.env.DECISION_OS_PATENT_FEEDBACK_LEARNING;
    process.env.DECISION_OS_PATENT_FEEDBACK_LEARNING = '1';
    try {
      const { patch, historyDelta } = applyPatentFeedbackLearning(baseDso());
      const weights = (patch.userIntent?.preferences as any)?.activityWeights;
      expect(weights.spaActivities).toBeCloseTo(0.15, 5);
      expect(historyDelta?.type).toBe('patent_feedback_learning');
      expect((historyDelta?.payload as any)?.lyapunovStable).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.DECISION_OS_PATENT_FEEDBACK_LEARNING;
      else process.env.DECISION_OS_PATENT_FEEDBACK_LEARNING = prev;
    }
  });
});
