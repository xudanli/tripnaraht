import { selectItineraryDayEditorInsight } from './itinerary-day-editor-insight.selector';
import type { ItineraryDayEditorBuiltContext } from './itinerary-day-editor-page-context.builder';
import type { PlanProposal } from '../../arrange-itinerary/types/plan-proposal.types';

function baseBuilt(
  overrides: Partial<ItineraryDayEditorBuiltContext> = {},
): ItineraryDayEditorBuiltContext {
  return {
    authoritative: {
      tripSnapshot: { tripVersion: 'v1' },
      relevantWorldState: { worldStateVersion: 'none' },
      constraintAssessments: [],
      decisionProblems: [],
      selectedEntities: [],
      availableActions: [],
      pageFocus: {
        pageId: 'ITINERARY_DAY_EDITOR',
        lifecycle: 'PLANNING',
        selectedRefs: [],
      },
    },
    versions: { relevantTripProjectionVersion: 'v1' },
    gate: { ok: true, missing: [] },
    dayIndex: 3,
    dayItems: [
      {
        itemId: 'a',
        label: '瀑布',
        startTime: '09:00',
        endTime: '11:00',
        type: 'ACTIVITY',
        needsBooking: false,
      },
      {
        itemId: 'b',
        label: '午餐',
        startTime: '12:00',
        endTime: '13:00',
        type: 'MEAL',
        needsBooking: false,
      },
    ],
    dayPlanStatus: 'READY',
    daySeverity: 'CLEAR',
    mustHandleCount: 0,
    suggestAdjustCount: 0,
    activityCount: 2,
    lodgingCount: 0,
    pendingBookingLabels: [],
    confirmedActivityLabels: ['瀑布'],
    gaps: [],
    allowedFactTokens: ['3', '第3天', '瀑布', '午餐', '09:00', '11:00', '12:00', '13:00'],
    ...overrides,
  };
}

function proposal(status: 'PASS' | 'WARN' | 'BLOCK'): PlanProposal {
  return {
    proposalId: 'prop_day_1',
    tripId: 't1',
    userId: 'copilot-context-builder',
    intent: 'OPTIMIZE_ROUTE',
    basePlanVersion: 1,
    contextVersion: 1,
    affectedDays: [3],
    changes: [],
    tradeoffs: ['午餐后移30分钟影响最小。'],
    validation: {
      status,
      warnings: status === 'WARN' ? ['上一活动延迟至12:30，将占用原午餐时间。'] : [],
      conflicts:
        status === 'BLOCK'
          ? [{ kind: 'OVERLAP', message: '调序后仍无法避开17:00结束冲突。' }]
          : [],
    },
    diff: {
      timelineChanges: [
        { operation: 'MOVE', label: '午餐', dayIndex: 3, impact: 'medium', to: '12:30' },
      ],
      summary: 'reorder',
    },
    requiresConfirmation: true,
    status: 'AWAITING_CONFIRMATION',
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    source: { type: 'ai_action', payload: {} },
  };
}

describe('selectItineraryDayEditorInsight', () => {
  it('CONTEXT_MISSING when gate fails', () => {
    const sel = selectItineraryDayEditorInsight({
      built: baseBuilt({
        gate: { ok: false, code: 'CONTEXT_MISSING', missing: ['selectedDay'] },
      }),
    });
    expect(sel.modeReason).toBe('CONTEXT_MISSING');
  });

  it('READY day → SILENT', () => {
    const sel = selectItineraryDayEditorInsight({
      built: baseBuilt({ dayPlanStatus: 'READY', daySeverity: 'CLEAR' }),
    });
    expect(sel.mode).toBe('SILENT');
    expect(sel.modeReason).toBe('DAY_CLEAR');
  });

  it('INCOMPLETE lodging-only → draft actions', () => {
    const sel = selectItineraryDayEditorInsight({
      built: baseBuilt({
        dayPlanStatus: 'INCOMPLETE',
        daySeverity: 'SOFT',
        dayIndex: 4,
        dayItems: [
          {
            itemId: 'h1',
            label: '维克旅馆',
            startTime: '20:00',
            endTime: '08:00',
            type: 'ACCOMMODATION',
            needsBooking: true,
          },
        ],
        activityCount: 0,
        lodgingCount: 1,
        incompleteReason: '只有住宿，关键活动与路线尚未安排',
        pendingBookingLabels: ['维克旅馆'],
        confirmedActivityLabels: [],
        allowedFactTokens: ['4', 'Day 4', '维克旅馆', '只有住宿，关键活动与路线尚未安排'],
      }),
    });
    expect(sel.modeReason).toBe('DAY_INCOMPLETE');
    expect(sel.title).toContain('不完整');
    expect(sel.observationSummary).toMatch(/只有住宿|尚未安排/);
    expect(sel.actions.some((a) => a.kind === 'PREVIEW' && a.actionType === 'GENERATE_DAY_DRAFT')).toBe(
      true,
    );
  });

  it('OPTIMIZABLE gaps + pending booking → confirm booking first', () => {
    const sel = selectItineraryDayEditorInsight({
      built: baseBuilt({
        dayPlanStatus: 'OPTIMIZABLE',
        daySeverity: 'SOFT',
        dayItems: [
          {
            itemId: 'g1',
            label: '索尔马冰川',
            startTime: '15:00',
            endTime: '15:30',
            type: 'ACTIVITY',
            needsBooking: true,
          },
          {
            itemId: 'g2',
            label: '迪霍拉里海岬',
            startTime: '15:54',
            endTime: '16:24',
            type: 'ACTIVITY',
            needsBooking: true,
          },
          {
            itemId: 'h1',
            label: '维克旅馆',
            startTime: '20:00',
            endTime: '08:00',
            type: 'ACCOMMODATION',
            needsBooking: true,
          },
        ],
        activityCount: 2,
        lodgingCount: 1,
        pendingBookingLabels: ['索尔马冰川', '迪霍拉里海岬', '维克旅馆'],
        confirmedActivityLabels: [],
        gaps: [
          {
            afterLabel: '起点',
            beforeLabel: '索尔马冰川',
            startTime: '14:00',
            endTime: '15:00',
            minutes: 90,
          },
          {
            afterLabel: '迪霍拉里海岬',
            beforeLabel: '维克旅馆',
            startTime: '16:24',
            endTime: '20:00',
            minutes: 216,
          },
        ],
        longestGap: {
          afterLabel: '迪霍拉里海岬',
          beforeLabel: '维克旅馆',
          startTime: '16:24',
          endTime: '20:00',
          minutes: 216,
        },
        allowedFactTokens: [
          '索尔马冰川',
          '迪霍拉里海岬',
          '维克旅馆',
          '14:00',
          '16:24',
          '20:00',
          '空档',
          '预订',
        ],
      }),
    });
    expect(sel.modeReason).toBe('DAY_OPTIMIZABLE');
    expect(sel.observationSummary).toMatch(/空档|待预订/);
    expect(sel.ruleSuggestion).toMatch(/预订|住宿/);
    expect(sel.actions[0]).toMatchObject({
      kind: 'PREVIEW',
      actionType: expect.stringMatching(/BOOKING|LODGING/),
    });
    expect(sel.observationSummary).not.toMatch(/活动详情|字段/);
  });

  it('OPTIMIZABLE confirmed activities + lodging pending', () => {
    const sel = selectItineraryDayEditorInsight({
      built: baseBuilt({
        dayPlanStatus: 'OPTIMIZABLE',
        daySeverity: 'SOFT',
        dayItems: [
          {
            itemId: 'a',
            label: '盖歇尔间歇泉',
            startTime: '13:30',
            endTime: '15:30',
            type: 'ACTIVITY',
            bookingStatus: 'CONFIRMED',
            needsBooking: false,
          },
          {
            itemId: 'b',
            label: '黄金瀑布',
            startTime: '15:44',
            endTime: '17:14',
            type: 'ACTIVITY',
            bookingStatus: 'CONFIRMED',
            needsBooking: false,
          },
          {
            itemId: 'h',
            label: '塞尔福斯宾馆',
            startTime: '20:00',
            endTime: '08:00',
            type: 'ACCOMMODATION',
            needsBooking: true,
          },
        ],
        activityCount: 2,
        lodgingCount: 1,
        pendingBookingLabels: ['塞尔福斯宾馆'],
        confirmedActivityLabels: ['盖歇尔间歇泉', '黄金瀑布'],
        gaps: [
          {
            afterLabel: '黄金瀑布',
            beforeLabel: '塞尔福斯宾馆',
            startTime: '18:09',
            endTime: '20:00',
            minutes: 111,
          },
        ],
        longestGap: {
          afterLabel: '黄金瀑布',
          beforeLabel: '塞尔福斯宾馆',
          startTime: '18:09',
          endTime: '20:00',
          minutes: 111,
        },
        // Stale system issue must not dominate
        topIssue: {
          issueId: 'stale',
          priority: 'suggest_adjust',
          message: '辛格维利尔国家公园的规则已超14天未核验，可能影响入场。',
          affectedLabels: [],
          systemMaintenance: true,
        },
        allowedFactTokens: [
          '盖歇尔间歇泉',
          '黄金瀑布',
          '塞尔福斯宾馆',
          '18:09',
          '20:00',
          '住宿',
        ],
      }),
    });
    expect(sel.observationSummary).toMatch(/住宿|塞尔福斯/);
    expect(sel.observationSummary).not.toMatch(/14天|未核验|辛格维利尔/);
    expect(sel.ruleSuggestion).toMatch(/住宿/);
  });

  it('SOFT + validated WARN → ATTENTION with PREVIEW_REORDER', () => {
    const sel = selectItineraryDayEditorInsight({
      built: baseBuilt({
        dayPlanStatus: 'OPTIMIZABLE',
        daySeverity: 'SOFT',
        topIssue: {
          issueId: 'iss1',
          priority: 'suggest_adjust',
          message: '上一活动延迟至12:30，将占用原午餐时间。',
          affectedLabels: ['瀑布', '午餐'],
        },
        proposal: proposal('WARN'),
        proposalActionType: 'PREVIEW_REORDER',
        suggestAdjustCount: 1,
        allowedFactTokens: [
          '3',
          '瀑布',
          '午餐',
          '12:30',
          '上一活动延迟至12:30，将占用原午餐时间。',
          '午餐后移30分钟影响最小。',
          '30',
        ],
      }),
    });
    expect(sel.mode).toBe('ATTENTION');
    expect(sel.hasValidatedRecommendation).toBe(true);
    expect(sel.actions.some((a) => a.kind === 'PREVIEW')).toBe(true);
  });

  it('BLOCKED without proposal → INTERVENTION, no invented recommend', () => {
    const sel = selectItineraryDayEditorInsight({
      built: baseBuilt({
        dayPlanStatus: 'BLOCKED',
        daySeverity: 'HARD',
        mustHandleCount: 1,
        topIssue: {
          issueId: 'iss2',
          priority: 'must_handle',
          message: '当日驾驶超时且无法在日落前抵达。',
          affectedLabels: ['瀑布'],
        },
        proposal: undefined,
        allowedFactTokens: ['瀑布', '当日驾驶超时且无法在日落前抵达。'],
      }),
    });
    expect(sel.mode).toBe('INTERVENTION');
    expect(sel.hasValidatedRecommendation).toBe(false);
    expect(sel.recommendation).toBeUndefined();
  });
});
