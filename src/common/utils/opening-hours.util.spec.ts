import { OpeningHoursUtil, OPENING_HOURS_UNKNOWN } from './opening-hours.util';

describe('OpeningHoursUtil', () => {
  describe('getTodayHours', () => {
    it('should return "24 Hours" for osmFormat "24小时开放"', () => {
      const metadata = { openingHours: { osmFormat: '24小时开放' } };
      expect(OpeningHoursUtil.getTodayHours(metadata)).toBe('24 Hours');
    });

    it('should return "24 Hours" for visit_info.opening_hours "全天开放"', () => {
      const metadata = { visit_info: { opening_hours: '全天开放' } };
      expect(OpeningHoursUtil.getTodayHours(metadata)).toBe('24 Hours');
    });

    it('should return "24 Hours" for opening_hours "24/7"', () => {
      const metadata = { opening_hours: '24/7' };
      expect(OpeningHoursUtil.getTodayHours(metadata)).toBe('24 Hours');
    });

    it('should return visit_info string when only visit_info has opening_hours', () => {
      const metadata = { visit_info: { opening_hours: '08:00-22:00' } };
      expect(OpeningHoursUtil.getTodayHours(metadata)).toBe('08:00-22:00');
    });

    it('should use weekday when openingHours has weekday', () => {
      const metadata = {
        openingHours: { weekday: '09:00-18:00', weekend: '10:00-16:00' },
      };
      const result = OpeningHoursUtil.getTodayHours(metadata);
      expect(['09:00-18:00', '10:00-16:00']).toContain(result);
    });
  });

  describe('getHoursForDate', () => {
    it('should return "24 Hours" for osmFormat "全天开放" (natural attractions)', () => {
      const metadata = { openingHours: { osmFormat: '全天开放' } };
      const sunday = new Date('2026-02-22T12:00:00Z');
      expect(OpeningHoursUtil.getHoursForDate(metadata, sunday, 'Atlantic/Reykjavik')).toBe('24 Hours');
    });

    it('should return "24 Hours" for visit_info.opening_hours "24小时开放"', () => {
      const metadata = { visit_info: { opening_hours: '24小时开放' } };
      const sunday = new Date('2026-02-22T12:00:00Z');
      expect(OpeningHoursUtil.getHoursForDate(metadata, sunday)).toBe('24 Hours');
    });

    it('should return OPENING_HOURS_UNKNOWN when openingHours is empty (no weekday/weekend)', () => {
      const metadata = { openingHours: {} };
      const sunday = new Date('2026-02-22T12:00:00Z');
      expect(OpeningHoursUtil.getHoursForDate(metadata, sunday)).toBe(OPENING_HOURS_UNKNOWN);
    });
  });

  describe('isOpenNow', () => {
    it('should return true for "24 Hours"', () => {
      expect(OpeningHoursUtil.isOpenNow('24 Hours')).toBe(true);
    });

    it('should return true for "全天开放"', () => {
      expect(OpeningHoursUtil.isOpenNow('全天开放')).toBe(true);
    });

    it('should return false for "Closed"', () => {
      expect(OpeningHoursUtil.isOpenNow('Closed')).toBe(false);
    });
  });

  describe('isOpenAt', () => {
    it('should return true for "全天开放" at any planned time', () => {
      const at = new Date('2026-06-03T14:55:00.000Z');
      expect(OpeningHoursUtil.isOpenAt('全天开放', at, 'Atlantic/Reykjavik')).toBe(true);
    });
  });
});
