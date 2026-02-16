// src/agent/context-engine/services/incremental-itinerary-generator.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { IncrementalItineraryGeneratorService } from './incremental-itinerary-generator.service';

describe('IncrementalItineraryGeneratorService', () => {
  let service: IncrementalItineraryGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IncrementalItineraryGeneratorService],
    }).compile();

    service = module.get(IncrementalItineraryGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateIncremental', () => {
    it('当 days < 3 时使用 full 模式', async () => {
      const request = {
        request_id: 'req-1',
        origin: 'Reykjavik',
        destination: 'Iceland',
        days: 2,
        start_date: '2025-07-01',
      } as any;
      const result = await service.generateIncremental({
        request,
        research_data: { poi_evidence: { pois: [] } },
        minDaysToTrigger: 3,
      });
      expect(result.mode).toBe('full');
      expect(result.itinerary.days).toHaveLength(2);
    });

    it('当 days >= 3 时使用 incremental 模式', async () => {
      const request = {
        request_id: 'req-2',
        origin: 'Reykjavik',
        destination: 'Iceland',
        days: 4,
        start_date: '2025-07-01',
      } as any;
      const result = await service.generateIncremental({
        request,
        research_data: { poi_evidence: { pois: [] } },
        minDaysToTrigger: 3,
      });
      expect(result.mode).toBe('incremental');
      expect(result.itinerary.days).toHaveLength(4);
      expect(result.daySummaries).toHaveLength(4);
    });

    it('compressPreviousDays 生成正确摘要', () => {
      const days = [
        { date: '2025-07-01', items: [{ location_ref: { name: 'A' } }, { location_ref: { name: 'B' } }] },
        { date: '2025-07-02', items: [{ location_ref: { name: 'C' } }] },
      ] as any;
      const summaries = service.compressPreviousDays(days);
      expect(summaries).toHaveLength(2);
      expect(summaries[0]).toMatchObject({ day: 1, date: '2025-07-01', itemCount: 2, keyLocations: ['A', 'B'] });
      expect(summaries[1]).toMatchObject({ day: 2, date: '2025-07-02', itemCount: 1, keyLocations: ['C'] });
    });
  });
});
