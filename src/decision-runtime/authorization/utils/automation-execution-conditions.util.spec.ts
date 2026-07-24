import {
  evaluateAutomationExecutionConditions,
  resolveEffectiveExecutionConditions,
} from './automation-execution-conditions.util';

describe('automation-execution-conditions.util', () => {
  it('blocks when onlyUnbooked violated', () => {
    const result = evaluateAutomationExecutionConditions({
      matchedActionKeys: ['activity.reorder_unbooked_low_priority'],
      automation: {},
      context: {
        action: {
          actionId: 'c1',
          title: '调整已预订活动',
          requiresConfirmation: true,
        },
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.violatedConditions).toContain('onlyUnbooked');
  });

  it('blocks cross-day when noCrossDay configured', () => {
    const result = evaluateAutomationExecutionConditions({
      matchedActionKeys: ['time_route.update_eta'],
      automation: {
        defaultLevel: 'AUTO_EXECUTE_CONDITIONAL',
        autoAllowed: [],
        confirmationRequired: [],
        executionConditions: {
          'time_route.update_eta': { noCrossDay: true },
        },
      },
      context: {
        action: {
          actionId: 'c1',
          summary: '跨天移动活动',
          expectedImpact: { affectedDays: [2, 3] },
        },
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.violatedConditions).toContain('noCrossDay');
  });

  it('merges user executionConditions overrides', () => {
    const effective = resolveEffectiveExecutionConditions(['activity.trim_optional_items'], {
      defaultLevel: 'AUTO_EXECUTE_CONDITIONAL',
      autoAllowed: [],
      confirmationRequired: [],
      executionConditions: {
        'activity.trim_optional_items': { maxItemsPerChange: 1 },
      },
    });

    expect(effective.maxItemsPerChange).toBe(1);
  });

  it('passes when all conditions satisfied', () => {
    const result = evaluateAutomationExecutionConditions({
      matchedActionKeys: ['time_route.insert_rest_buffer'],
      automation: {},
      context: {
        action: {
          actionId: 'buffer',
          summary: '插入 15 分钟缓冲',
          expectedImpact: { durationDelta: -15, budgetDelta: 0 },
        },
      },
    });

    expect(result.allowed).toBe(true);
  });
});
