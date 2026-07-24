import {
  buildLightweightTemporalGroundingZhLines,
  buildTemporalGroundingLine,
  computeDaysUntilTripStartYmd,
  lightweightAnswerCitesWrongCurrentYm,
  lightweightAnswerImpliesWrongTripLeadTimeClaim,
  parseTripDatesFromLightweightContext,
  shouldRepairLightweightTemporalHallucination,
} from './temporal-grounding.util';

describe('temporal-grounding.util', () => {
  const fixed = new Date('2026-05-20T10:30:00.000Z');

  it('buildTemporalGroundingLine embeds ISO instant', () => {
    expect(buildTemporalGroundingLine(fixed)).toContain('2026-05-20T10:30:00.000Z');
  });

  it('parseTripDatesFromLightweightContext reads start/end', () => {
    const ctx = '目的地代码: IS\n开始日期: 2026-06-01\n结束日期: 2026-06-07';
    expect(parseTripDatesFromLightweightContext(ctx)).toEqual({
      startYmd: '2026-06-01',
      endYmd: '2026-06-07',
    });
  });

  it('buildLightweightTemporalGroundingZhLines includes trip lead days', () => {
    const lines = buildLightweightTemporalGroundingZhLines(fixed, {
      tripStartYmd: '2026-06-01',
      tripEndYmd: '2026-06-07',
    });
    expect(lines[0]).toContain('2026-05-20');
    expect(lines[1]).toMatch(/距出行开始约 12 天/);
  });

  it('detects wrong 当前日期 year-month', () => {
    const bad =
      '重要前提：由于当前日期（2025年4月）距离您的出行日期（2026年6月）超过一年，没有可靠实时预报。';
    expect(lightweightAnswerCitesWrongCurrentYm(bad, fixed)).toBe(true);
    const ok = '出行日为 2026年6月，请结合季节准备装备。';
    expect(lightweightAnswerCitesWrongCurrentYm(ok, fixed)).toBe(false);
  });

  it('detects 超过一年 when trip is soon', () => {
    expect(
      lightweightAnswerImpliesWrongTripLeadTimeClaim('距离出行超过一年，暂无预报。', 12),
    ).toBe(true);
    expect(
      lightweightAnswerImpliesWrongTripLeadTimeClaim('距离出行超过一年，暂无预报。', 400),
    ).toBe(false);
  });

  it('shouldRepairLightweightTemporalHallucination combines checks', () => {
    expect(
      shouldRepairLightweightTemporalHallucination(
        '由于当前日期（2025年4月）超过一年…',
        fixed,
        { daysUntilTripStart: 12 },
      ),
    ).toBe(true);
    expect(computeDaysUntilTripStartYmd('2026-06-01', fixed)).toBe(12);
  });
});
