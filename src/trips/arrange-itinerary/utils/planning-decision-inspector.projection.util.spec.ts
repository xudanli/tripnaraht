import {
  buildEmptyInspectorMemberConsensus,
  buildEmptyInspectorPlanDiff,
  buildInspectorFeasibilityForProblem,
  buildInspectorPlanDiffFromPreview,
  buildInspectorTabEmptyState,
} from './planning-decision-inspector.projection.util';

describe('planning-decision-inspector.projection.util', () => {
  it('buildEmptyInspectorPlanDiff returns empty arrays', () => {
    const diff = buildEmptyInspectorPlanDiff();
    expect(diff.changeRows).toEqual([]);
    expect(diff.impactTags).toEqual([]);
    expect(diff.unchangedItems).toEqual([]);
    expect(diff.timelineCompare.milestones).toEqual([]);
  });

  it('buildEmptyInspectorMemberConsensus has no fake aiSummary', () => {
    const consensus = buildEmptyInspectorMemberConsensus([
      { userId: 'u1', role: 'owner', displayName: 'Alice' },
    ]);
    expect(consensus.aiSummary).toEqual([]);
    expect(consensus.supportCount).toBe(0);
    expect(consensus.assessment.canCreatorConfirm).toBe(false);
  });

  it('buildInspectorFeasibilityForProblem marks canSafelyWrite false', () => {
    const feas = buildInspectorFeasibilityForProblem({
      conflicts: [],
      primaryConflict: undefined,
    });
    expect(feas.canSafelyWrite).toBe(false);
    expect(feas.executionSummary).toEqual([]);
    expect(feas.headline).toContain('尚未选定');
  });

  it('buildInspectorPlanDiffFromPreview projects repair option mutations', () => {
    const planDiff = buildInspectorPlanDiffFromPreview({
      schemaId: 'tripnara.unified_decision_action_preview@v2',
      tripId: 'trip-1',
      problemId: 'dp-1',
      actionId: 'adjust_time',
      generatedAt: new Date().toISOString(),
      action: {
        actionId: 'adjust_time',
        type: 'REPAIR',
        source: 'CONSTRAINT_SOLVER',
        title: '顺延下一项开始时间',
        summary: '将布迪尔黑教堂开始时间调整到 11:45',
        expectedImpact: { durationDelta: -19 },
        requiresConfirmation: false,
        allowed: true,
      },
      tradeoffs: [
        {
          dimension: 'TIME',
          direction: 'IMPROVE',
          value: 21,
          unit: 'MINUTE',
          explanation: '开始时间提前 21 分钟',
        },
      ],
      proposedMutations: {
        mutationId: 'm1',
        tripId: 'trip-1',
        createdAt: new Date().toISOString(),
        createdBy: 'test',
        versionBefore: '1',
        operations: [
          {
            operation: 'UPDATE',
            entityType: 'ITINERARY_ITEM',
            entityId: 'item-1',
            after: {
              payload: {
                suggestedValue: '2026-07-20T11:45:00.000+00:00',
                anchors: {
                  toPlaceLabel: '布迪尔黑教堂',
                  activityStartAt: '2026-07-20T12:06:00.000+00:00',
                  suggestedTime: '2026-07-20T11:45:00.000+00:00',
                },
              },
            },
            semanticEffects: [],
          },
        ],
      },
    });

    expect(planDiff.optionId).toBe('adjust_time');
    expect(planDiff.changeRows).toHaveLength(1);
    expect(planDiff.changeRows[0].itemLabel).toBe('布迪尔黑教堂');
    expect(planDiff.changeRows[0].before).toBe('12:06');
    expect(planDiff.changeRows[0].after).toBe('11:45');
  });

  it('buildInspectorPlanDiffFromPreview prefers repairPreview.itineraryDiff', () => {
    const planDiff = buildInspectorPlanDiffFromPreview({
      schemaId: 'tripnara.unified_decision_action_preview@v2',
      tripId: 'trip_iceland_demo',
      problemId: 'dp_day1_traffic_skew',
      actionId: 'adjust_time',
      generatedAt: new Date().toISOString(),
      action: {
        actionId: 'adjust_time',
        type: 'REPAIR',
        source: 'CONSTRAINT_SOLVER',
        title: '顺延下一项开始时间',
        summary: '提前离开蓝湖，压缩同日交通偏差',
        expectedImpact: { durationDelta: -20, affectedMembers: ['u1'] },
        requiresConfirmation: false,
        allowed: true,
      },
      tradeoffs: [
        {
          dimension: 'TIME',
          direction: 'IMPROVE',
          value: 20,
          unit: 'MINUTE',
        },
      ],
      proposedMutations: { operations: [] },
      repairPreview: {
        tripId: 'trip_iceland_demo',
        blockerId: 'block-1',
        optionId: 'adjust_time',
        actionType: 'adjust_time',
        previewMode: 'decision_engine_dry_run',
        status: 'preview',
        message: 'preview',
        before: {
          dayNumber: 1,
          itemCount: 4,
          totalItemCount: 4,
          highlights: ['交通缓冲 -17 分钟', '午餐 12:40'],
        },
        after: {
          dayNumber: 1,
          itemCount: 4,
          totalItemCount: 4,
          highlights: ['交通缓冲 +3 分钟', '午餐 12:40'],
        },
        itineraryDiff: [
          {
            slotId: 'slot_blue_lagoon',
            changeType: 'time_changed',
            dayNumber: 1,
            before: { title: '蓝湖', time: '10:00', endTime: '10:45' },
            after: { title: '蓝湖', time: '10:00', endTime: '10:25' },
          },
          {
            slotId: 'slot_depart',
            changeType: 'time_changed',
            dayNumber: 1,
            before: { title: '出发', time: '10:50' },
            after: { title: '出发', time: '10:30' },
          },
          {
            slotId: 'slot_church',
            changeType: 'time_changed',
            dayNumber: 1,
            before: { title: '抵达教堂', time: '11:37' },
            after: { title: '抵达教堂', time: '11:17' },
          },
        ],
        impact: { feasibilityScoreBefore: 40, estimated: true },
      },
    });

    expect(planDiff.changeRows.length).toBeGreaterThanOrEqual(3);
    expect(planDiff.changeRows.some((r) => r.itemLabel.includes('蓝湖'))).toBe(true);
    expect(planDiff.impactTags.some((t) => t.label.includes('时间点'))).toBe(true);
    expect(planDiff.impactTags.some((t) => t.label.includes('预算不变'))).toBe(true);
    expect(planDiff.unchangedItems.some((u) => u.includes('午餐'))).toBe(true);
    expect(planDiff.timelineCompare.milestones.length).toBeGreaterThanOrEqual(3);
    expect(planDiff.timelineCompare.milestones.some((m) => m.durationAfterMinutes != null)).toBe(
      true,
    );
    expect(planDiff.changeRows.some((r) => r.itemLabel === '交通缓冲')).toBe(true);
  });

  it('expandSameDayTravelPlanDiff from travel anchors (同日交通偏差)', () => {
    const planDiff = buildInspectorPlanDiffFromPreview({
      schemaId: 'tripnara.unified_decision_action_preview@v2',
      tripId: 'trip_iceland_demo',
      problemId: 'dp_day1_traffic_skew',
      actionId: 'adjust_time',
      generatedAt: new Date().toISOString(),
      action: {
        actionId: 'adjust_time',
        type: 'REPAIR',
        source: 'CONSTRAINT_SOLVER',
        title: '顺延下一项开始时间',
        summary: '将哈尔格林姆斯教堂开始时间提前',
        requiresConfirmation: false,
        allowed: true,
      },
      tradeoffs: [{ dimension: 'TIME', direction: 'IMPROVE', value: 20, unit: 'MINUTE' }],
      proposedMutations: {
        mutationId: 'm1',
        tripId: 'trip_iceland_demo',
        createdAt: new Date().toISOString(),
        createdBy: 'test',
        versionBefore: '1',
        operations: [
          {
            operation: 'UPDATE',
            entityType: 'ITINERARY_ITEM',
            entityId: 'item-church',
            after: {
              payload: {
                itemId: 'item-church',
                suggestedValue: '2026-07-16T11:17:00.000+00:00',
                anchors: {
                  fromPlaceLabel: '蓝湖温泉',
                  toPlaceLabel: '哈尔格林姆斯教堂',
                  departAt: '2026-07-16T10:50:00.000+00:00',
                  activityStartAt: '2026-07-16T11:37:00.000+00:00',
                  suggestedTime: '2026-07-16T11:17:00.000+00:00',
                  gapMinutes: -17,
                  bufferMinutes: 5,
                  travelMinutes: 47,
                },
              },
            },
            semanticEffects: [],
          },
        ],
      },
    });

    expect(planDiff.changeRows.length).toBeGreaterThanOrEqual(3);
    expect(planDiff.changeRows.some((r) => r.itemLabel.includes('蓝湖'))).toBe(true);
    expect(planDiff.changeRows.some((r) => r.itemLabel === '出发时间')).toBe(true);
    expect(planDiff.changeRows.some((r) => r.itemLabel === '交通缓冲')).toBe(true);
    const buffer = planDiff.changeRows.find((r) => r.itemLabel === '交通缓冲');
    expect(buffer?.before).toContain('-17');
    expect(buffer?.after).toContain('+3');
    expect(planDiff.impactTags.some((t) => t.label.includes('时间点'))).toBe(true);
    expect(planDiff.timelineCompare.milestones.length).toBeGreaterThanOrEqual(2);
  });

  it('buildInspectorTabEmptyState flags problem mode tabs', () => {
    expect(
      buildInspectorTabEmptyState({
        causalChainNodeCount: 0,
        planDiffRowCount: 0,
        memberHasStance: false,
        hasProposal: false,
      }),
    ).toEqual({
      causalChain: true,
      planDiff: true,
      memberConsensus: true,
      feasibility: true,
    });
  });
});
