import {
  DecisionSpacePageContextBuilder,
} from './decision-space-page-context.builder';
import type { UnifiedDecisionOptionsView } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';

describe('DecisionSpacePageContextBuilder.collectScheduleConflictPreviews', () => {
  const optionsView: UnifiedDecisionOptionsView = {
    schemaId: 'tripnara.unified_decision_options@v2',
    tripId: 'trip_t',
    problemId: 'dp_lunch',
    generatedAt: new Date().toISOString(),
    actions: [
      {
        actionId: 'shift_30',
        type: 'ALTERNATIVE',
        source: 'RULE_ENGINE',
        title: '午餐后移 30 分钟',
        summary: '…',
        requiresConfirmation: true,
        allowed: true,
      },
      {
        actionId: 'add_buffer',
        type: 'ALTERNATIVE',
        source: 'RULE_ENGINE',
        title: '增加活动缓冲',
        summary: '…',
        requiresConfirmation: true,
        allowed: true,
      },
      {
        actionId: 'defer',
        type: 'DEFER',
        source: 'RULE_ENGINE',
        title: '稍后',
        summary: '…',
        requiresConfirmation: false,
        allowed: true,
      },
    ],
    actionability: {
      requiresAction: true,
      allowedActions: ['ALTERNATIVE'],
      writeChain: 'CONSTRAINT_WRITEBACK',
    },
  };

  it('maps Gateway previews into RecommendGatePreview (resolved)', async () => {
    const gateway = {
      previewOption: jest.fn(async (_t: string, problemId: string, optionId: string) => ({
        schemaId: 'tripnara.unified_decision_action_preview@v2' as const,
        tripId: 'trip_t',
        problemId,
        actionId: optionId,
        generatedAt: new Date().toISOString(),
        action: {
          actionId: optionId,
          type: 'ALTERNATIVE' as const,
          source: 'RULE_ENGINE' as const,
          title: optionId === 'shift_30' ? '午餐后移 30 分钟' : '增加活动缓冲',
          summary: '',
          requiresConfirmation: true,
          allowed: true,
        },
        tradeoffs: [],
        repairPreview: { remainingBlockingIssues: [] },
      })),
    };

    const builder = new DecisionSpacePageContextBuilder(
      gateway as never,
      {} as never,
      {} as never,
    );

    const previews = await builder.collectScheduleConflictPreviews({
      tripId: 'trip_t',
      problemId: 'dp_lunch',
      optionsView,
      planVersion: 'pv1',
    });

    expect(gateway.previewOption).toHaveBeenCalledTimes(2); // DEFER skipped
    expect(previews).toHaveLength(2);
    expect(previews.every((p) => p.resolved)).toBe(true);
    expect(previews[0].planVersion).toBe('pv1');
  });

  it('marks unresolved when repair still blocking', async () => {
    const gateway = {
      previewOption: jest.fn(async () => ({
        schemaId: 'tripnara.unified_decision_action_preview@v2' as const,
        tripId: 'trip_t',
        problemId: 'dp_lunch',
        actionId: 'shift_30',
        generatedAt: new Date().toISOString(),
        action: {
          actionId: 'shift_30',
          type: 'ALTERNATIVE' as const,
          source: 'RULE_ENGINE' as const,
          title: '午餐后移 30 分钟',
          summary: '',
          requiresConfirmation: true,
          allowed: true,
        },
        tradeoffs: [],
        repairPreview: { remainingBlockingIssues: ['still_overlap'] },
      })),
    };

    const builder = new DecisionSpacePageContextBuilder(
      gateway as never,
      {} as never,
      {} as never,
    );

    const previews = await builder.collectScheduleConflictPreviews({
      tripId: 'trip_t',
      problemId: 'dp_lunch',
      optionsView: {
        ...optionsView,
        actions: optionsView.actions.filter((a) => a.actionId === 'shift_30'),
      },
      planVersion: 'pv1',
    });

    expect(previews).toHaveLength(1);
    expect(previews[0].resolved).toBe(false);
    expect(previews[0].remainingBlockingIssues).toContain('still_overlap');
  });

  it('skips failed previews without throwing', async () => {
    const gateway = {
      previewOption: jest.fn(async () => {
        throw new Error('GATEWAY_DOWN');
      }),
    };

    const builder = new DecisionSpacePageContextBuilder(
      gateway as never,
      {} as never,
      {} as never,
    );

    const previews = await builder.collectScheduleConflictPreviews({
      tripId: 'trip_t',
      problemId: 'dp_lunch',
      optionsView,
      planVersion: null,
    });

    expect(previews).toEqual([]);
  });
});
