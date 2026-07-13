import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import type { PlanningRuleResult } from '../../tep/contracts/tep-self-drive.types';
import {
  buildNoNightDayDetail,
  buildNoNightDetailsFromTepRules,
  buildNoNightScheduleForPreview,
} from './constraint-impact-no-night-schedule.util';

describe('constraint-impact-no-night-schedule.util', () => {
  const conflict: PlanningConflictItem = {
    id: 'no-night-1',
    source: 'feasibility',
    priority: 'must_handle',
    category: 'transport',
    title: '不夜驾',
    message:
      '日落后 30 分钟不得继续驾驶。Day 1「雷克雅未克 → 维克」预计 23:40 抵达，晚于截止 23:57（日落 23:27）。',
    affectedDays: [1],
    issue: {
      id: 'issue-no-night-1',
      priority: 'must_handle',
      category: 'transport',
      title: '不夜驾',
      message:
        '日落后 30 分钟不得继续驾驶。Day 1「雷克雅未克 → 维克」预计 23:40 抵达，晚于截止 23:57（日落 23:27）。',
      affectedDays: [1],
      severity: 'high',
      issueKind: 'no_night_drive',
      anchors: {
        fromPlaceLabel: '雷克雅未克',
        toPlaceLabel: '维克',
        fromItemId: 'iti_rey',
        toItemId: 'iti_vik',
        departAt: '2026-07-15T09:00:00.000Z',
        arriveAt: '2026-07-15T23:40:00.000Z',
      },
    },
  };

  it('buildNoNightDayDetail renders route and sunset violation', () => {
    const detail = buildNoNightDayDetail(conflict, 30);
    expect(detail?.items?.[0]?.label).toBe('雷克雅未克 → 维克');
    expect(detail?.items?.[0]?.startTimeLabel).toBe('09:00');
    expect(detail?.items?.[0]?.detail).toContain('23:40');
    expect(detail?.items?.[0]?.detail).toContain('日落 23:27');
  });

  it('buildNoNightDetailsFromTepRules fills preview when planning conflicts are absent', () => {
    const details = buildNoNightDetailsFromTepRules({
      tepRuleResults: [
        {
          ruleId: 'SDR-202',
          outcome: 'SUGGEST_REPAIR',
          severity: 'HIGH',
          affectedRefs: ['drive_leg_1_1', 'day_1'],
          explanation:
            '驾驶段预计 23:40 结束，超出安全截止 23:57（日落 23:27 + 30 分钟，+43min）',
          evidenceRefs: [
            {
              provider: 'TEP',
              sourceType: 'INTERNAL',
              observedAt: '2026-07-15T00:00:00.000Z',
              predicate: 'daylight.sunset:23:27',
            },
          ],
        },
      ],
      dailyDrivePlans: [
        {
          date: '2026-07-15',
          dayIndex: 1,
          origin: { ref: 'anchor_rey', label: '雷克雅未克' },
          destination: { ref: 'anchor_vik', label: '维克' },
          legs: [
            {
              legId: 'drive_leg_1_1',
              fromRef: 'iti_rey',
              toRef: 'iti_vik',
              baseNavigationMinutes: 160,
              roadRefs: [],
              importance: 'MANDATORY',
              flexibility: 'MOVABLE',
            },
          ],
          activities: [],
          buffers: [],
        },
      ],
      itemLabelsById: new Map([
        ['iti_rey', '雷克雅未克'],
        ['iti_vik', '维克'],
      ]),
    });

    expect(details[0]?.dayNumber).toBe(1);
    expect(details[0]?.items?.[0]?.label).toBe('雷克雅未克 → 维克');
    expect(details[0]?.items?.[0]?.detail).toContain('23:40');
  });

  it('tolerates missing affectedRefs, dailyDrivePlans, and legs without throwing', () => {
    expect(() =>
      buildNoNightDetailsFromTepRules({
        tepRuleResults: [
          {
            ruleId: 'SDR-202',
            outcome: 'SUGGEST_REPAIR',
            severity: 'HIGH',
            explanation:
              '驾驶段预计 23:40 结束，超出安全截止 23:57（日落 23:27 + 30 分钟，+43min）',
          } as PlanningRuleResult,
        ],
        dailyDrivePlans: undefined,
      }),
    ).not.toThrow();

    const details = buildNoNightScheduleForPreview({
      conflicts: null,
      tepRuleResults: [
        {
          ruleId: 'SDR-202',
          outcome: 'UNKNOWN',
          severity: 'MEDIUM',
          degraded: true,
          degradationReason: 'DAYLIGHT_DATA_AMBIGUOUS',
          explanation: '第 1 日日照数据不可用（高纬极昼/极夜），已降级',
          affectedRefs: ['day_1'],
        },
      ],
      dailyDrivePlans: null,
    });

    expect(details).toHaveLength(1);
    expect(details[0]?.dayNumber).toBe(1);
    expect(details[0]?.items).toBeUndefined();
    expect(details[0]?.daySummary).toContain('降级');
  });

  it('falls back to assessment summary when conflict lacks route anchors', () => {
    const detail = buildNoNightDayDetail({
      ...conflict,
      issue: {
        ...conflict.issue!,
        anchors: undefined,
      },
    });
    expect(detail?.items).toBeUndefined();
    expect(detail?.daySummary).toContain('日落后 30 分钟');
  });
});
