import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { DecisionAction } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import {
  buildDecisionQueueHeadline,
  buildExecutabilityHeadline,
  projectListItemToConsumerDecision,
} from './consumer-decision-item.projection.util';

function listItem(partial: Partial<UnifiedDecisionProblemListItem> & Pick<UnifiedDecisionProblemListItem, 'problemId' | 'title' | 'summary' | 'enforcement'>): UnifiedDecisionProblemListItem {
  return {
    semanticKey: 'test.key',
    instanceKey: partial.problemId,
    type: 'CONSTRAINT_VIOLATION',
    dimension: 'TRANSPORT',
    phase: 'PLANNING',
    affectsPlan: true,
    workflowStatus: 'WAITING_DECISION',
    executionStatus: 'NOT_STARTED',
    scope: { tripId: 'trip_1', dayIds: [3] },
    evidenceSummary: { count: 1, freshness: 'FRESH', confidence: 0.9 },
    actionability: {
      requiresAction: true,
      allowedActions: ['CHANGE_ROUTE'],
    },
    occurrenceCount: 1,
    detectors: [{ detectorId: 'road', label: '冰岛道路管理局' }],
    origin: { authority: 'CANONICAL', primaryDetector: 'road' },
    ...partial,
  };
}

describe('consumer-decision-item.projection.util', () => {
  it('builds consumer headline without engineering terms', () => {
    expect(buildDecisionQueueHeadline(2, 1)).toContain('2 件事');
    expect(buildDecisionQueueHeadline(0, 0)).toBe('当前没有需要您决定的事项');
  });

  it('maps BLOCK enforcement to executability BLOCKED', () => {
    const result = buildExecutabilityHeadline({
      blockingCount: 1,
      openCount: 1,
      pendingVerificationCount: 0,
    });
    expect(result.status).toBe('BLOCKED');
  });

  it('projects F208-style item with recommendation', () => {
    const actions: DecisionAction[] = [
      {
        actionId: 'opt_route',
        type: 'CHANGE_ROUTE',
        source: 'CANONICAL',
        title: '绕行南岸',
        summary: '绕开 F208',
        allowed: true,
        requiresConfirmation: true,
      },
    ];

    const item = projectListItemToConsumerDecision(
      listItem({
        problemId: 'problem_f208',
        title: 'F208 当前不可通行',
        summary: '2WD 车辆无法进入 F 路',
        enforcement: 'BLOCK',
      }),
      { actions },
    );

    expect(item.headline).toBe('F208 当前不可通行');
    expect(item.impact).toContain('第 3 天');
    expect(item.recommendation?.title).toBe('绕行南岸');
    expect(item.actions.acceptRecommended.enabled).toBe(true);
    expect(item.actions.acceptRecommended.actionId).toBe('opt_route');
    expect(item.actions.keepOriginal.enabled).toBe(false);
    expect(item.actions.keepOriginal.actionId).toBeUndefined();
    expect(item.evidenceSummary?.sourceLabel).toBe('冰岛道路管理局');
    expect(JSON.stringify(item)).not.toContain('engineId');
  });

  it('exposes keepOriginal and defer actionId when matching actions exist', () => {
    const actions: DecisionAction[] = [
      {
        actionId: 'opt_route',
        type: 'REPAIR',
        source: 'CANONICAL',
        title: '绕行',
        allowed: true,
        requiresConfirmation: true,
      },
      {
        actionId: 'original',
        type: 'REPAIR',
        source: 'CANONICAL',
        title: '保留原计划',
        allowed: true,
        requiresConfirmation: true,
      },
      {
        actionId: 'defer_1',
        type: 'DEFER',
        source: 'RULE_ENGINE',
        title: '稍后再说',
        allowed: true,
        requiresConfirmation: false,
      },
    ];

    const item = projectListItemToConsumerDecision(
      listItem({
        problemId: 'problem_wx',
        title: '强风影响户外活动',
        summary: '建议改为室内',
        enforcement: 'REQUIRE_ADJUSTMENT',
      }),
      { actions },
    );

    expect(item.actions.keepOriginal).toEqual({ enabled: true, actionId: 'original' });
    expect(item.actions.defer).toEqual({ enabled: true, actionId: 'defer_1' });
  });

  it('does not enable keepOriginal/defer without resolvable actionId', () => {
    const item = projectListItemToConsumerDecision(
      listItem({
        problemId: 'problem_only_repair',
        title: '仅推荐修复',
        summary: '无保留/延后选项',
        enforcement: 'REQUIRE_ADJUSTMENT',
      }),
      {
        actions: [
          {
            actionId: 'opt_route',
            type: 'REPAIR',
            source: 'CANONICAL',
            title: '绕行',
            allowed: true,
            requiresConfirmation: true,
          },
        ],
      },
    );

    expect(item.actions.keepOriginal.enabled).toBe(false);
    expect(item.actions.keepOriginal.actionId).toBeUndefined();
    expect(item.actions.defer.enabled).toBe(false);
    expect(item.actions.defer.actionId).toBeUndefined();
  });
});
