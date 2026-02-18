/**
 * TripContextExtractorService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TripContextExtractorService } from './trip-context-extractor.service';

describe('TripContextExtractorService', () => {
  let service: TripContextExtractorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TripContextExtractorService],
    }).compile();
    service = module.get<TripContextExtractorService>(TripContextExtractorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extract', () => {
    it('null/undefined 应返回最小化 TripContext', () => {
      expect(service.extract(null)).toEqual({
        traveler: {},
        trip: {},
        itinerary: { countries: [] },
      });
      expect(service.extract(undefined)).toEqual({
        traveler: {},
        trip: {},
        itinerary: { countries: [] },
      });
    });

    it('应从字符串 destination 提取国家代码', () => {
      const ctx = service.extract({
        destination: 'IS-Reykjavik',
        date_range: { start_date: '2026-06-01', end_date: '2026-06-05' },
      });
      expect(ctx.itinerary.countries).toEqual(['IS']);
      expect(ctx.trip.startDate).toBe('2026-06-01');
      expect(ctx.trip.endDate).toBe('2026-06-05');
    });

    it('应从 budget 推断 budgetLevel', () => {
      const high = service.extract({ destination: 'X', constraints: { budget: { total: 6000 } } });
      expect(high.traveler.budgetLevel).toBe('high');
      const mid = service.extract({ destination: 'X', constraints: { budget: { total: 3000 } } });
      expect(mid.traveler.budgetLevel).toBe('medium');
      const low = service.extract({ destination: 'X', constraints: { budget: { total: 1000 } } });
      expect(low.traveler.budgetLevel).toBe('low');
    });

    it('object destination 应返回 UNKNOWN 国家', () => {
      const ctx = service.extract({ destination: { lat: 64, lng: -21 } });
      expect(ctx.itinerary.countries).toEqual(['UNKNOWN']);
    });
  });

  describe('extractSeason', () => {
    it('应正确提取季节', () => {
      expect(service.extractSeason('2026-04-15')).toBe('spring');
      expect(service.extractSeason('2026-07-20')).toBe('summer');
      expect(service.extractSeason('2026-10-01')).toBe('autumn');
      expect(service.extractSeason('2026-01-10')).toBe('winter');
    });

    it('无效日期应降级返回', () => {
      // new Date('invalid') 不抛错，getMonth() 为 NaN，最终落入 default 分支
      const result = service.extractSeason('invalid');
      expect(['winter', 'all']).toContain(result);
    });
  });
});
