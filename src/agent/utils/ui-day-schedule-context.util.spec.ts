import { stripUiInjectedDayScheduleContext } from './ui-day-schedule-context.util';

describe('stripUiInjectedDayScheduleContext', () => {
  it('strips trailing [日程] DayN block', () => {
    expect(
      stripUiInjectedDayScheduleContext('您好\n\n[日程] Day2 Day 2 · 黄金圈'),
    ).toBe('您好');
  });

  it('keeps body when schedule is not a trailing UI anchor', () => {
    const msg = '请把[日程]里第二天的瀑布删掉';
    expect(stripUiInjectedDayScheduleContext(msg)).toBe(msg);
  });

  it('no-ops without marker', () => {
    expect(stripUiInjectedDayScheduleContext('您好')).toBe('您好');
  });
});
