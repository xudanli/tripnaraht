import type { UnifiedDecisionActionPreviewView } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import { buildCounterfactualFromOptionPreviews } from './decision-checker-option-preview.util';

describe('decision-checker-option-preview.util', () => {
  it('CAS-020: builds counterfactual scenarios from unified option previews', () => {
    const preview: UnifiedDecisionActionPreviewView = {
      schemaId: 'tripnara.unified_decision_action_preview@v2',
      tripId: 'trip-1',
      problemId: 'dp_EXCESSIVE_DAILY_LOAD',
      actionId: 'insert_rest',
      generatedAt: '2026-07-03T00:00:00.000Z',
      action: {
        actionId: 'insert_rest',
        type: 'REPAIR',
        source: 'FEASIBILITY',
        title: '插入缓冲日',
        summary: '在 Day 2 后增加休息日',
        expectedImpact: { feasibilityDelta: 12, durationDelta: -90 },
      },
      tradeoffs: [],
    };

    const counterfactual = buildCounterfactualFromOptionPreviews([preview], {
      id: 'issue-1',
      priority: 'must_handle',
      category: 'transport',
      title: '每日驾驶上限',
      message: '超出驾驶上限',
      severity: 'high',
    });

    expect(counterfactual.headline).toBe('可选方案预览');
    expect(counterfactual.scenarios).toHaveLength(1);
    expect(counterfactual.scenarios[0].id).toBe('insert_rest');
    expect(counterfactual.scenarios[0].action?.payload?.problemId).toBe('dp_EXCESSIVE_DAILY_LOAD');
  });
});
