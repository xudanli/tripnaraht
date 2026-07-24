import {
  formatHmInDestinationTimezone,
  parseItineraryWindowInDestinationLocal,
  resolveDestinationTimezoneForVerify,
} from './verify-opening-hours-timezone.util';
import { OpeningHoursUtil } from '../../common/utils/opening-hours.util';

describe('verify-opening-hours-timezone.util', () => {
  it('resolves Iceland from country_code', () => {
    expect(resolveDestinationTimezoneForVerify({ researchData: { country_code: 'IS' } })).toBe(
      'Atlantic/Reykjavik',
    );
  });

  it('parses HH:mm as destination wall-clock, not UTC hour', () => {
    const dt = parseItineraryWindowInDestinationLocal('2026-06-03', '11:30', 'Asia/Tokyo')!;
    expect(dt.toFormat('HH:mm')).toBe('11:30');
    expect(dt.offset).toBe(540);
  });

  it('formatHmInDestinationTimezone converts UTC instant to local display', () => {
    // 2026-06-03 02:30 UTC = 11:30 JST
    const hm = formatHmInDestinationTimezone(
      new Date('2026-06-03T02:30:00.000Z'),
      'Asia/Tokyo',
      '09:00',
    );
    expect(hm).toBe('11:30');
  });

  it('isOpenAt uses destination-local minutes for seasonal summer window', () => {
    const dt = parseItineraryWindowInDestinationLocal('2026-06-03', '11:30', 'Atlantic/Reykjavik')!;
    expect(OpeningHoursUtil.isOpenAt('8:00-18:00', dt.toJSDate(), 'Atlantic/Reykjavik')).toBe(true);
  });
});
