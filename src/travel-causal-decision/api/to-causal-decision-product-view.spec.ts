import {
  resolveLifecycleStatus,
  resolveProblemIdFromDecisionId,
  toCausalDecisionProductView,
  buildStatusMessage,
} from './to-causal-decision-product-view';
import { buildStrongWindAppointmentFixture } from '../fixtures';

describe('toCausalDecisionProductView', () => {
  it('maps decisionId / problemId aliases', () => {
    expect(resolveProblemIdFromDecisionId('dec_prob_1')).toBe('prob_1');
    expect(resolveProblemIdFromDecisionId('prob_1')).toBe('prob_1');
  });

  it('projects stable product BFF view with actByLabel', () => {
    const decision = buildStrongWindAppointmentFixture();
    const view = toCausalDecisionProductView({
      decision,
      problemId: 'prob_wind_1',
    });
    expect(view.schema).toBe('tripnara.causal_decision_product@v1');
    expect(view.decisionId).toBe(decision.decisionId);
    expect(view.problemId).toBe('prob_wind_1');
    expect(view.headline).toBeTruthy();
    expect(view.card.whatHappened).toBeTruthy();
    expect(view.lifecycleStatus).toBe('OPEN');
    expect(view.actByLabel).toMatch(/最晚需要在/);
  });

  it('does not claim verified before observation', () => {
    const decision = buildStrongWindAppointmentFixture();
    const withSelection = {
      ...decision,
      outcome: {
        schema: 'tripnara.decision_outcome@v1' as const,
        selectedOptionId: decision.recommendation?.optionId ?? 'opt_x',
        predictedOutcome: decision.baselineOutcome,
        reconciliation: 'PENDING' as const,
        explanation: 'awaiting observation',
      },
    };
    expect(resolveLifecycleStatus(withSelection)).toBe('SELECTED');
    expect(buildStatusMessage('AWAITING_OBSERVATION', withSelection)).toContain(
      '等待实际到达',
    );
    expect(buildStatusMessage('AWAITING_OBSERVATION', withSelection)).not.toContain(
      '已验证',
    );
  });
});