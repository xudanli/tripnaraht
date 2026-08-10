import {
  buildNextActivityAnswerZh,
  buildPendingAnswerZh,
  buildTodayPlanAnswerZh,
  buildTripDayTimelineFromDays,
  formatTodayTimelinePromptLines,
  isTodayPlanDirectAnswerQuery,
} from './trip-day-timeline-fact.util';
import { resolveFastQueryContextEntry } from './task-context.registry';
import { compileAgentTaskContract } from './compile-agent-task-contract.util';

describe('trip-day-timeline-fact Fast Query slices', () => {
  const baseDays = [
    {
      date: '2026-06-10',
      items: [
        { type: 'ACTIVITY', nameZh: '蓝湖', bookingStatus: 'CONFIRMED', order: 1 },
        { type: 'ACTIVITY', nameZh: '雷市漫步', bookingStatus: null, order: 2 },
      ],
    },
    {
      date: '2026-06-11',
      items: [{ type: 'ACTIVITY', nameZh: '黄金圈', bookingStatus: 'PENDING', order: 1 }],
    },
    {
      date: '2026-06-12',
      items: [],
    },
  ];

  it('CASE-Q03 today plan uses current day timeline', () => {
    expect(isTodayPlanDirectAnswerQuery('今天怎么安排')).toBe(true);
    expect(resolveFastQueryContextEntry('今天怎么安排').key).toBe('TRIP_QUERY_TODAY');
    const slice = buildTripDayTimelineFromDays({
      tripId: 't1',
      asOfYmd: '2026-06-10',
      days: baseDays,
    });
    expect(slice.currentDayNumber).toBe(1);
    expect(buildTodayPlanAnswerZh(slice)).toContain('蓝湖');
    expect(formatTodayTimelinePromptLines(slice).join('\n')).toContain('TRIP_QUERY_TODAY');
  });

  it('CASE-Q04 next activity', () => {
    const slice = buildTripDayTimelineFromDays({
      tripId: 't1',
      asOfYmd: '2026-06-10',
      days: baseDays,
    });
    expect(buildNextActivityAnswerZh(slice)).toContain('雷市漫步');
    expect(compileAgentTaskContract({ message: '下一站是什么', tripId: 't1', turnId: 'n' })
      .scope.contextRegistryKey).toBe('TRIP_QUERY_NEXT');
  });

  it('CASE-Q05 pending list only — no commit', () => {
    const slice = buildTripDayTimelineFromDays({
      tripId: 't1',
      asOfYmd: '2026-06-10',
      days: baseDays,
    });
    expect(slice.unconfirmed.length).toBeGreaterThanOrEqual(2);
    const answer = buildPendingAnswerZh(slice);
    expect(answer).toMatch(/待确认/);
    expect(answer).toMatch(/不会替你选定/);
    const c = compileAgentTaskContract({
      message: '还有哪些没确认',
      tripId: 't1',
      turnId: 'p',
    });
    expect(c.taskType).toBe('TRIP_QUERY');
    expect(c.authority).toBe('READ_ONLY');
    expect(c.capabilities.deny).toEqual(expect.arrayContaining(['CREATE_DECISION', 'APPLY']));
  });
});
