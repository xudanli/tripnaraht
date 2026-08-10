import {
  buildNarrationFocusGroundingPromptLines,
  messageHasExplicitDayFocus,
  parseFocusedDayFromWorldStateBlock,
  tripContextHasActivityWorldState,
  tripContextHasDayWorldState,
} from './build-narration-focus-grounding.util';

describe('build-narration-focus-grounding.util (B2-NARRATION-FOCUS-GROUNDING)', () => {
  const world = [
    '【日焦点 World State】',
    'requestedDay=Day4',
    'resolvedDate=2026-08-18',
    'dayTheme=冰川徒步',
    'itemsOnDay=(无已入库日程项)',
    'matchedActivityAcrossTrip=Day3(2026-08-17) 索尔黑马冰川',
    'conflict=activity_on_other_day',
  ].join('\n');

  const activityWorld = [
    '【活动焦点 World State】',
    'activityHint=冰川徒步需要提前订吗',
    'themeDaysMatching=Day4(2026-08-18)「冰川徒步」items=(无已入库日程项)',
    'matchedActivityAcrossTrip=Day3(2026-08-17) 索尔黑马冰川',
  ].join('\n');

  it('detects world state and focused day', () => {
    expect(tripContextHasDayWorldState(world)).toBe(true);
    expect(parseFocusedDayFromWorldStateBlock(world)).toBe(4);
    expect(messageHasExplicitDayFocus('Day 4 冰川徒步还有位置吗')).toBe(true);
    expect(messageHasExplicitDayFocus('我们4个人能订冰川徒步吗')).toBe(false);
  });

  it('focused Day4: forbids unprompted Day5 and requires theme vs item distinction', () => {
    const lines = buildNarrationFocusGroundingPromptLines({
      tripContextJoined: world,
      message: 'Day 4 冰川徒步还有位置吗',
    });
    const text = lines.join('\n');
    expect(text).toContain('Focused Day = Day4');
    expect(text).toContain('禁止');
    expect(text).toMatch(/Day5|其他未在 matchedActivityAcrossTrip/);
    expect(text).toContain('dayTheme ≠ confirmed item');
    expect(text).toContain('实际安排在 DayX');
  });

  it('activity focus: forbids unlisted sightseeing days', () => {
    expect(tripContextHasActivityWorldState(activityWorld)).toBe(true);
    const lines = buildNarrationFocusGroundingPromptLines({
      tripContextJoined: activityWorld,
      message: '冰川徒步需要提前订吗',
    });
    const text = lines.join('\n');
    expect(text).toContain('活动焦点 World State');
    expect(text).toContain('themeDaysMatching');
    expect(text).toMatch(/Day5|未列出/);
    expect(text).toContain('实际安排在 Day3');
  });

  it('no day focus: forbids inventing confirmed DayN from themes', () => {
    const lines = buildNarrationFocusGroundingPromptLines({
      tripContextJoined: '目的地代码: IS\n开始日期: 2026-08-15',
      message: '这个要提前订吗？',
    });
    const text = lines.join('\n');
    expect(text).toContain('无日焦点');
    expect(text).toContain('禁止把 metadata 日主题');
    expect(text).toContain('首句须澄清');
  });
});
