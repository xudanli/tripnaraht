import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import {
  buildDaySplitFromSchedule,
  buildSplitPlanFromDaySplit,
  enrichSplitPlanFromSchedule,
  appendSplitNoteTag,
} from './split-plan-schedule.builder.util';
import type { SplitPlanScheduleSource } from './split-plan-schedule.source.util';

function makeSchedule(): SplitPlanScheduleSource {
  return {
    tripId: 'trip-1',
    totalMemberCount: 12,
    memberCluster: {
      groupA: {
        memberIds: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'],
        label: '体能较好组（8 人）',
        members: [
          { id: 'u1', displayName: 'Alice' },
          { id: 'u2', displayName: 'Bob' },
        ],
      },
      groupB: {
        memberIds: ['u9', 'u10', 'u11', 'u12'],
        label: '节奏保守组（4 人）',
        members: [{ id: 'u9', displayName: 'Carol' }],
      },
    },
    days: [
      {
        tripDayId: 'day-3',
        dayNumber: 3,
        dayIndex: 2,
        dateLabel: '2026-07-03',
        items: [
          {
            id: 'item-depart',
            tripDayId: 'day-3',
            dayNumber: 3,
            dayIndex: 2,
            type: 'TRANSIT',
            title: 'Skógafoss 停靠',
            startTime: '08:00',
            endTime: '10:20',
            startMs: 8 * 3600000,
            endMs: 10.33 * 3600000,
            intensity: 'low',
            riskLevel: 'low',
          },
          {
            id: 'item-hike',
            tripDayId: 'day-3',
            dayNumber: 3,
            dayIndex: 2,
            type: 'ACTIVITY',
            title: '冰川徒步体验',
            placeName: 'Sólheimajökull',
            startTime: '11:00',
            endTime: '15:30',
            startMs: 11 * 3600000,
            endMs: 15.5 * 3600000,
            intensity: 'high',
            riskLevel: 'medium',
            trailId: 42,
            costPerPerson: '¥880/人',
            estimatedCost: 880,
            currency: 'CNY',
          },
          {
            id: 'item-rest',
            tripDayId: 'day-3',
            dayNumber: 3,
            dayIndex: 2,
            type: 'REST',
            title: '咖啡店休息',
            startTime: '11:00',
            endTime: '15:30',
            startMs: 11 * 3600000,
            endMs: 15.5 * 3600000,
            intensity: 'low',
            riskLevel: 'low',
            costPerPerson: '¥220/人',
            estimatedCost: 220,
            currency: 'CNY',
          },
          {
            id: 'item-dinner',
            tripDayId: 'day-3',
            dayNumber: 3,
            dayIndex: 2,
            type: 'MEAL_ANCHOR',
            title: '酒店晚餐',
            startTime: '17:30',
            endTime: '19:00',
            startMs: 17.5 * 3600000,
            endMs: 19 * 3600000,
            intensity: 'low',
            riskLevel: 'low',
          },
        ],
      },
    ],
  };
}

describe('split-plan-schedule.builder.util', () => {
  it('builds daySplit from schedule items with fork/rejoin', () => {
    const schedule = makeSchedule();
    const issue: FeasibilityIssueDto = {
      id: 'fatigue-1',
      priority: 'suggest_adjust',
      category: 'team_fit',
      issueKind: 'team_pacing_fatigue',
      title: '高强度日',
      message: '疲劳',
      affectedDays: [3],
      severity: 'high',
      fromItemId: 'item-hike',
    };

    const daySplit = buildDaySplitFromSchedule({
      schedule,
      dayNumber: 3,
      splitPlanId: 'split_d3_glacier',
      kind: 'physical_strength',
      triggerIssue: issue,
    });

    expect(daySplit).not.toBeNull();
    expect(daySplit!.sharedBefore).toHaveLength(1);
    expect(daySplit!.fork?.startTime).toBe('11:00');
    expect(daySplit!.fork?.afterSegmentId).toBe('seg_item-depart');
    expect(daySplit!.sharedBefore[0].title).toBe('Skógafoss 停靠');
    expect(daySplit!.branches).toHaveLength(2);
    expect(daySplit!.branches[0].segments[0].title).toBe('冰川徒步体验');
    expect(daySplit!.branches[1].segments[0].title).toBe('咖啡店休息');
    expect(daySplit!.rejoin?.title).toBe('酒店晚餐');
    expect(daySplit!.stats?.meetupTime).toBe('17:30');
    expect(daySplit!.branches[0].members).toEqual([
      { id: 'u1', displayName: 'Alice' },
      { id: 'u2', displayName: 'Bob' },
    ]);
    expect(daySplit!.branches[0].segments[0].placeName).toBe('Sólheimajökull');
  });

  it('projects full segments and members on splitPlan groups', () => {
    const schedule = makeSchedule();
    const daySplit = buildDaySplitFromSchedule({
      schedule,
      dayNumber: 3,
      splitPlanId: 'split_d3_glacier',
      kind: 'physical_strength',
    });
    const splitPlan = buildSplitPlanFromDaySplit({
      daySplit: daySplit!,
      splitPlanId: 'split_d3_glacier',
      kind: 'physical_strength',
      trigger: {
        id: 'f1',
        priority: 'suggest_adjust',
        category: 'team_fit',
        issueKind: 'team_pacing_fatigue',
        title: 't',
        message: 'm',
        severity: 'high',
      },
      metrics: [],
    });
    expect(splitPlan.groups[0].members).toHaveLength(2);
    expect(splitPlan.groups[0].segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '冰川徒步体验',
          placeName: 'Sólheimajökull',
          startTime: '11:00',
          endTime: '15:30',
        }),
      ]),
    );
  });

  it('enriches splitPlan groups from schedule branches', () => {
    const schedule = makeSchedule();
    const daySplit = buildDaySplitFromSchedule({
      schedule,
      dayNumber: 3,
      splitPlanId: 'split_d3_glacier',
      kind: 'physical_strength',
    });
    expect(daySplit).not.toBeNull();

    const enriched = enrichSplitPlanFromSchedule(
      {
        id: 'split_d3_glacier',
        kind: 'physical_strength',
        banner: { title: 't', message: 'm', affectedDays: [3] },
        recommendation: { title: 'r', summary: 's' },
        metrics: [],
        groups: [
          {
            id: 'grp_a',
            label: 'A',
            memberCount: 1,
            activityTitle: 'x',
            highlights: [],
          },
          {
            id: 'grp_b',
            label: 'B',
            memberCount: 1,
            activityTitle: 'y',
            highlights: [],
          },
        ],
        logistics: { meetupPoint: 'p', meetupTime: '17:30' },
        actions: [],
      },
      daySplit!,
      schedule,
    );

    expect(enriched.groups[0].activityTitle).toBe('高强度体验');
    expect(enriched.groups[0].memberCount).toBe(8);
    expect(enriched.groups[0].highlights).toEqual(
      expect.arrayContaining(['冰川徒步体验 4.5 小时', '专业向导 & 安全保障', '拍摄与探索']),
    );
    expect(enriched.groups[1].activityTitle).toBe('舒适休息');
    expect(enriched.groups[1].highlights).toEqual(
      expect.arrayContaining(['咖啡馆时光', '低疲劳 & 轻松安排']),
    );
    expect(enriched.logistics.meetupPoint).toBe('酒店晚餐');
  });

  it('uses POI placeName for meetup when rejoin activity title is generic 休息', () => {
    const schedule: SplitPlanScheduleSource = {
      tripId: 'trip-1',
      totalMemberCount: 12,
      memberCluster: makeSchedule().memberCluster,
      days: [
        {
          tripDayId: 'day-3',
          dayNumber: 3,
          dayIndex: 2,
          items: [
            ...makeSchedule().days[0].items.filter((i) => i.id !== 'item-dinner'),
            {
              id: 'item-hotel-rest',
              tripDayId: 'day-3',
              dayNumber: 3,
              dayIndex: 2,
              type: 'REST',
              title: '休息',
              placeName: '斯科加维克酒店 · 餐厅',
              startTime: '17:30',
              endTime: '19:00',
              startMs: 17.5 * 3600000,
              endMs: 19 * 3600000,
              intensity: 'low',
              riskLevel: 'low',
            },
          ],
        },
      ],
    };

    const daySplit = buildDaySplitFromSchedule({
      schedule,
      dayNumber: 3,
      splitPlanId: 'split_d3_glacier',
      kind: 'physical_strength',
    });
    expect(daySplit!.rejoin?.title).toBe('斯科加维克酒店 · 餐厅');

    const splitPlan = buildSplitPlanFromDaySplit({
      daySplit: daySplit!,
      splitPlanId: 'split_d3_glacier',
      kind: 'physical_strength',
      trigger: {
        id: 'f1',
        priority: 'suggest_adjust',
        category: 'team_fit',
        issueKind: 'team_pacing_fatigue',
        title: 't',
        message: 'm',
        severity: 'high',
      },
      metrics: [],
    });
    expect(splitPlan.logistics.meetupPoint).toBe('斯科加维克酒店 · 餐厅');
  });

  it('appendSplitNoteTag adds group marker', () => {
    expect(appendSplitNoteTag(null, 'grp_a')).toBe('[split:grp_a]');
    expect(appendSplitNoteTag('已有备注', 'grp_b')).toBe('已有备注 [split:grp_b]');
    expect(appendSplitNoteTag('已有备注 [split:grp_b]', 'grp_b')).toBe('已有备注 [split:grp_b]');
  });

  it('filters internal note tags and uses hotel as meetup for driving-day split', () => {
    const schedule: SplitPlanScheduleSource = {
      tripId: 'trip-iceland',
      totalMemberCount: 2,
      memberCluster: {
        groupA: { memberIds: ['u1'], label: 'danli xu · 体能较好' },
        groupB: { memberIds: ['u2'], label: 'Danny · 节奏保守' },
      },
      days: [
        {
          tripDayId: 'day-1',
          dayNumber: 1,
          dayIndex: 0,
          items: [
            {
              id: 'airport',
              tripDayId: 'day-1',
              dayNumber: 1,
              dayIndex: 0,
              type: 'TRANSIT',
              title: '凯夫拉维克国际机场',
              startMs: 1,
              endMs: 2,
              intensity: 'low',
              riskLevel: 'low',
              note: '[timelineDisplayRole:landing_point]',
            },
            {
              id: 'rental',
              tripDayId: 'day-1',
              dayNumber: 1,
              dayIndex: 0,
              type: 'TRANSIT',
              title: 'Geysir Car Rental',
              placeName: 'Geysir Car Rental',
              startMs: 3,
              endMs: 4,
              intensity: 'low',
              riskLevel: 'low',
              note: '[timelineDisplayRole:car_rental]',
              subtitle: '12, Kirkjustræti, Miðbær, 雷克雅未克, 冰岛 / 冰島',
              lat: 64.1466,
              lng: -21.9406,
            },
            {
              id: 'geysir',
              tripDayId: 'day-1',
              dayNumber: 1,
              dayIndex: 0,
              type: 'ACTIVITY',
              title: '盖歇尔间歇泉',
              placeName: '盖歇尔间歇泉',
              startMs: 5,
              endMs: 6,
              intensity: 'medium',
              riskLevel: 'low',
              note: '模板推荐的景点：盖歇尔间歇泉',
              lat: 64.31,
              lng: -20.3,
            },
            {
              id: 'selja',
              tripDayId: 'day-1',
              dayNumber: 1,
              dayIndex: 0,
              type: 'ACTIVITY',
              title: '塞里雅兰瀑布',
              placeName: '塞里雅兰瀑布',
              startMs: 7,
              endMs: 8,
              intensity: 'medium',
              riskLevel: 'low',
              note: '模板推荐的景点：塞里雅兰瀑布',
              lat: 63.6185,
              lng: -19.9965,
            },
            {
              id: 'hotel',
              tripDayId: 'day-1',
              dayNumber: 1,
              dayIndex: 0,
              type: 'REST',
              title: '黑沙滩套房酒店',
              placeName: '黑沙滩套房酒店',
              startTime: '16:14',
              startMs: 9,
              endMs: 10,
              intensity: 'low',
              riskLevel: 'low',
              note: '[timelineDisplayRole:hotel]',
              travelDurationMin: 64,
              lat: 63.42,
              lng: -19.01,
            },
            {
              id: 'diamond',
              tripDayId: 'day-1',
              dayNumber: 1,
              dayIndex: 0,
              type: 'ACTIVITY',
              title: '钻石沙滩',
              placeName: '钻石沙滩',
              startTime: '20:04',
              startMs: 11,
              endMs: 12,
              intensity: 'medium',
              riskLevel: 'low',
            },
          ],
        },
      ],
    };

    const daySplit = buildDaySplitFromSchedule({
      schedule,
      dayNumber: 1,
      splitPlanId: 'split_d1_ring',
      kind: 'preference',
    });
    expect(daySplit).not.toBeNull();
    expect(daySplit!.sharedBefore).toHaveLength(4);
    expect(daySplit!.sharedBefore.map((s) => s.placeName)).toEqual([
      '凯夫拉维克国际机场',
      'Geysir Car Rental',
      '盖歇尔间歇泉',
      '塞里雅兰瀑布',
    ]);
    const rentalSeg = daySplit!.sharedBefore.find((s) => s.placeName === 'Geysir Car Rental');
    expect(rentalSeg?.subtitle).toBeTruthy();
    expect(rentalSeg?.highlights).toBeUndefined();
    expect(daySplit!.fork?.startTime).toBe('16:14');
    expect(daySplit!.fork?.afterSegmentId).toBe('seg_selja');
    expect(daySplit!.branches[0].segments.map((s) => s.placeName)).toEqual(['钻石沙滩']);
    expect(daySplit!.branches[1].segments[0].title).toBe('黑沙滩套房酒店');
    expect(daySplit!.rejoin?.title).toBe('黑沙滩套房酒店');

    const splitPlan = buildSplitPlanFromDaySplit({
      daySplit: daySplit!,
      splitPlanId: 'split_d1_ring',
      kind: 'preference',
      trigger: {
        id: 'pace-1',
        priority: 'suggest_adjust',
        category: 'team_fit',
        issueKind: 'team_pacing_friction',
        title: '偏好差异',
        message: 'm',
        severity: 'medium',
      },
      metrics: [],
    });

    expect(splitPlan.groups[0].activityTitle).toBe('均衡体验');
    expect(splitPlan.groups[0].segments?.[0].title).toBe('钻石沙滩');
    expect(splitPlan.groups[0].highlights.length).toBeGreaterThanOrEqual(2);
    expect(splitPlan.groups[1].activityTitle).toBe('轻松体验');
    expect(splitPlan.groups[1].highlights).toEqual(
      expect.arrayContaining(['酒店休息 & 观景', '低疲劳 & 轻松安排']),
    );
    expect(splitPlan.logistics.meetupPoint).toBe('黑沙滩套房酒店');
    expect(daySplit!.stats?.rentalHotel?.dropoffFeasible).toBe(true);
    expect(splitPlan.logistics.transport).toContain('B 组休息');
    expect(splitPlan.aiSuggestion?.text).toContain('全员同行');
    expect(splitPlan.aiSuggestion?.text).toContain('16:14');
    expect(splitPlan.aiSuggestion?.text).toContain('钻石沙滩');
    expect(splitPlan.aiSuggestion?.text).not.toContain('租车后先送');
    expect(splitPlan.groups[1].highlights.some((h) => h.includes('km'))).toBe(true);
  });

  it('uses latest branch end as meetup when B-group hotel rest starts before A finishes', () => {
    const schedule: SplitPlanScheduleSource = {
      tripId: 'trip-iceland',
      totalMemberCount: 2,
      memberCluster: {
        groupA: { memberIds: ['u1'], label: 'danli xu · 体能较好' },
        groupB: { memberIds: ['u2'], label: 'Danny · 节奏保守' },
      },
      days: [
        {
          tripDayId: 'day-1',
          dayNumber: 1,
          dayIndex: 0,
          items: [
            {
              id: 'geysir',
              tripDayId: 'day-1',
              dayNumber: 1,
              dayIndex: 0,
              type: 'ACTIVITY',
              title: '盖歇尔间歇泉',
              startTime: '12:26',
              endTime: '13:11',
              startMs: 12.43 * 3600000,
              endMs: 13.18 * 3600000,
              intensity: 'medium',
              riskLevel: 'low',
            },
            {
              id: 'selja',
              tripDayId: 'day-1',
              dayNumber: 1,
              dayIndex: 0,
              type: 'ACTIVITY',
              title: '塞里雅兰瀑布',
              startTime: '14:55',
              endTime: '15:40',
              startMs: 14.92 * 3600000,
              endMs: 15.67 * 3600000,
              intensity: 'medium',
              riskLevel: 'low',
            },
            {
              id: 'hotel',
              tripDayId: 'day-1',
              dayNumber: 1,
              dayIndex: 0,
              type: 'REST',
              title: '休息',
              placeName: '黑沙滩套房酒店',
              startTime: '16:14',
              endTime: '16:59',
              startMs: 16.23 * 3600000,
              endMs: 16.98 * 3600000,
              intensity: 'low',
              riskLevel: 'low',
              note: '[timelineDisplayRole:hotel]',
            },
            {
              id: 'diamond',
              tripDayId: 'day-1',
              dayNumber: 1,
              dayIndex: 0,
              type: 'ACTIVITY',
              title: '钻石沙滩',
              startTime: '20:04',
              endTime: '20:49',
              startMs: 20.07 * 3600000,
              endMs: 20.82 * 3600000,
              intensity: 'medium',
              riskLevel: 'low',
            },
          ],
        },
      ],
    };

    const daySplit = buildDaySplitFromSchedule({
      schedule,
      dayNumber: 1,
      splitPlanId: 'split_d1_ring',
      kind: 'preference',
    });

    expect(daySplit!.stats?.meetupTime).toBe('20:49');
    expect(daySplit!.rejoin?.startTime).toBe('20:49');
    expect(daySplit!.rejoin?.title).toBe('黑沙滩套房酒店');
    expect(daySplit!.sharedBefore).toHaveLength(2);
    expect(daySplit!.sharedBefore.map((s) => s.placeName)).toEqual(['盖歇尔间歇泉', '塞里雅兰瀑布']);
    expect(daySplit!.fork?.startTime).toBe('16:14');
    expect(daySplit!.branches[0].segments[0].placeName).toBe('钻石沙滩');
    expect(daySplit!.branches[1].segments[0].endTime).toBe('16:59');

    const splitPlan = buildSplitPlanFromDaySplit({
      daySplit: daySplit!,
      splitPlanId: 'split_d1_ring',
      kind: 'preference',
      trigger: {
        id: 'pace-1',
        priority: 'suggest_adjust',
        category: 'team_fit',
        issueKind: 'team_pacing_friction',
        title: '偏好差异',
        message: 'm',
        severity: 'medium',
      },
      metrics: [],
    });
    expect(splitPlan.logistics.meetupPoint).toBe('黑沙滩套房酒店');
    expect(splitPlan.logistics.meetupTime).toBe('20:49（±15 分钟弹性）');
  });
});
