import { DECISION_AUTOMATION_ACTOR_USER_ID } from '../../../decision-runtime/monitoring/decision-automation-chain.service';
import {
  buildSummary,
  formatEventId,
  projectAiActivityLogView,
} from './ai-activity-log.projection.util';

describe('projectAiActivityLogView', () => {
  it('builds timeline from change log with auto filter tag', () => {
    const view = projectAiActivityLogView({
      tripId: 'trip-1',
      generatedAt: '2026-07-04T15:10:00.000Z',
      resolutions: {},
      tripMetadata: {
        automationChangeLog: {
          schemaId: 'tripnara.automation_change_log@v1',
          entries: [
            {
              logId: 'acl_test',
              problemId: 'problem_1',
              appliedAt: '2026-07-04T14:32:00.000Z',
              changeSummary: '已根据风速变化重新检查天气',
              status: 'APPLIED',
              selectedActionId: 'cand_weather',
              matchedActionKeys: ['monitoring.weather_road_update'],
              automatic: true,
              reversible: true,
              undoActionId: 'original',
            },
          ],
        },
      },
    });

    expect(view.items[0]).toMatchObject({
      activityId: 'acl_test',
      category: 'MONITORING',
      statusTag: 'AUTO_EXECUTED',
      filterTags: expect.arrayContaining(['AUTO', 'WRITTEN_BACK']),
      actions: {
        viewEvidence: { enabled: true },
      },
    });
    expect(view.summary.todayActionCount).toBe(1);
    expect(view.summary.autoCompletedCount).toBe(1);
  });

  it('includes open decisions as waiting confirm items', () => {
    const view = projectAiActivityLogView({
      tripId: 'trip-1',
      generatedAt: '2026-07-04T15:10:00.000Z',
      resolutions: {},
      openDecisions: [
        {
          schemaId: 'tripnara.consumer_decision_item@v1',
          problemId: 'problem_open',
          headline: '第 3 天风速升高',
          impact: '影响第 3 天',
          explanation: '需要您确认是否调整户外活动',
          severity: 'CONFLICT',
          actions: {
            acceptRecommended: { enabled: true, actionId: 'cand_a' },
            keepOriginal: { enabled: true, actionId: 'original' },
            viewAlternatives: { enabled: false, count: 0 },
            defer: { enabled: true, actionId: 'defer' },
          },
        },
      ],
    });

    expect(view.items[0].statusTag).toBe('WAITING_CONFIRM');
    expect(view.summary.waitingConfirmCount).toBeGreaterThan(0);
  });

  it('marks manual resolution as user confirmed written back', () => {
    const view = projectAiActivityLogView({
      tripId: 'trip-1',
      generatedAt: '2026-07-04T15:10:00.000Z',
      resolutions: {
        p1: {
          resolutionId: 'res_manual',
          problemId: 'problem_2',
          selectedActionId: 'cand_a',
          writeChain: 'RFC001',
          status: 'APPLIED',
          decidedAt: '2026-07-04T13:00:00.000Z',
          decidedByUserId: 'user_123',
          automationMeta: {
            changeSummary: '用户确认启用 Plan B',
            actionTitle: '生成 3 套备选方案',
          },
        },
      },
    });

    expect(view.items[0]).toMatchObject({
      statusTag: 'WRITTEN_BACK',
      automatic: false,
      title: '生成 3 套备选方案',
    });
  });
});

describe('formatEventId', () => {
  it('formats EVT id from timestamp', () => {
    expect(formatEventId('2026-07-04T15:10:00.000Z', 'acl_test1234')).toMatch(/^EVT-20260704-/);
  });
});

describe('buildSummary', () => {
  it('computes delta vs yesterday', () => {
    const summary = buildSummary(
      [
        {
          activityId: 'a1',
          eventId: 'EVT-1',
          occurredAt: '2026-07-04T10:00:00.000Z',
          category: 'OTHER',
          categoryLabel: '其他',
          filterTags: ['ALL', 'AUTO', 'WRITTEN_BACK'],
          statusTag: 'AUTO_EXECUTED',
          statusLabel: '已自动执行',
          title: 't',
          reason: 'r',
          automatic: true,
          reversible: false,
          actions: {
            viewEvidence: { enabled: false },
            viewDiff: { enabled: false },
            viewPlan: { enabled: false },
          },
          detailHref: '/trips/t/ai-activity-log/a1',
        },
        {
          activityId: 'a2',
          eventId: 'EVT-2',
          occurredAt: '2026-07-03T10:00:00.000Z',
          category: 'OTHER',
          categoryLabel: '其他',
          filterTags: ['ALL', 'AUTO', 'WRITTEN_BACK'],
          statusTag: 'AUTO_EXECUTED',
          statusLabel: '已自动执行',
          title: 't',
          reason: 'r',
          automatic: true,
          reversible: false,
          actions: {
            viewEvidence: { enabled: false },
            viewDiff: { enabled: false },
            viewPlan: { enabled: false },
          },
          detailHref: '/trips/t/ai-activity-log/a2',
        },
      ],
      '2026-07-04T15:10:00.000Z',
    );

    expect(summary.todayActionCount).toBe(1);
    expect(summary.todayActionDelta).toBe(0);
  });
});
