import {
  buildItineraryAdjustDraftNarrative,
  buildPacingExperienceNarrativeBullets,
  isBannedDraftReasoningLine,
  isItineraryAdjustPacingIntent,
} from './itinerary-adjust-narrate.util';

describe('itinerary-adjust-narrate', () => {
  const pacingMetadata = {
    intake_user_message: '明天太累了，轻松一点',
    adaptive_replan_trigger: 'pacing' as const,
    itinerary_adjust_cross_day_excluded_count: 13,
    experience_curator_rationale_zh: [
      '冰火感官顺序：上午先「众神瀑布」，下午再进入「米湖自然温泉」疗愈收束。',
    ],
  };

  const relaxedSchedule = [
    { name: '众神瀑布', start_window: '2026-06-06T11:00', end_window: '2026-06-06T13:00', type: 'POI' },
    {
      name: '午间景观路段留白',
      start_window: '2026-06-06T13:00',
      end_window: '2026-06-06T14:00',
      type: 'REST',
    },
    {
      name: '米湖自然温泉',
      start_window: '2026-06-06T14:00',
      end_window: '2026-06-06T16:00',
      type: 'POI',
    },
  ];

  it('detects pacing intent from trigger or message', () => {
    expect(isItineraryAdjustPacingIntent(pacingMetadata)).toBe(true);
    expect(
      isItineraryAdjustPacingIntent({ intake_user_message: '想轻松一点' }),
    ).toBe(true);
  });

  it('bans system hygiene and hard-constraint copy', () => {
    expect(isBannedDraftReasoningLine('已去掉其它天去过的重复景点。')).toBe(true);
    expect(isBannedDraftReasoningLine('「米湖」13:55 → 09:00，提前以避免闭园或赶路。')).toBe(
      true,
    );
    expect(isBannedDraftReasoningLine('冰火感官的完美顺序：下午泡温泉收束。')).toBe(false);
  });

  it('builds evidence-backed pacing narrative with geographic and thermal facts', () => {
    const bullets = buildPacingExperienceNarrativeBullets({
      metadata: pacingMetadata,
      targetDayNumber: 6,
      targetDateIso: '2026-06-06',
      scheduleItems: relaxedSchedule,
    });
    expect(bullets.length).toBeGreaterThanOrEqual(3);
    expect(bullets.join('\n')).toMatch(/40|热量|动线|微气候|大巴/);
    expect(bullets.join('\n')).toMatch(/众神瀑布|米湖自然温泉/);
    expect(bullets.join('\n')).not.toMatch(/闭园|重复景点|走廊|去重/);
  });

  it('draft narrative delegates to pacing experience bullets', () => {
    const bullets = buildItineraryAdjustDraftNarrative({
      metadata: pacingMetadata,
      targetDateIso: '2026-06-06',
      targetDayNumber: 6,
      scheduleItems: relaxedSchedule,
    });
    expect(bullets.join('\n')).not.toMatch(/重复景点|闭园|→/);
    expect(bullets.some((b) => b.includes('米湖自然温泉'))).toBe(true);
  });
});
