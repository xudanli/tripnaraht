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

    it('研究仅 1 个 POI 且多日时不应把同一点复制到每一天（首日保留，其余日待安排）', async () => {
      const request = {
        request_id: 'req-one-poi',
        destination: '冰岛',
        days: 7,
        start_date: '2025-07-01',
        message: '凯夫拉维克进、阿克雷里出，少回头路',
      } as any;
      const pois = [{ poi_id: 'only1', name: '克罗萨河渡口' }];
      const result = await service.generateIncremental({
        request,
        research_data: { poi_evidence: { pois } },
        minDaysToTrigger: 3,
      });
      expect(result.itinerary.days).toHaveLength(7);
      const poiNames = result.itinerary.days.map(
        (d) => d.items.find((it: any) => it.type === 'POI')?.location_ref?.name,
      );
      expect(poiNames[0]).toBe('克罗萨河渡口');
      expect(poiNames.slice(1).every((n) => n == null)).toBe(true);
      for (let i = 1; i < 7; i++) {
        const rest = result.itinerary.days[i].items.find((it: any) => it.type === 'REST');
        expect(rest?.location_ref?.name).toBe('待安排');
        expect(String(rest?.notes ?? '')).toContain('研究阶段');
        const q = (rest as any)?.metadata?.suggested_poi_search_queries as string[] | undefined;
        expect(Array.isArray(q) && q!.length).toBeGreaterThan(0);
        expect(q!.some((s) => /Iceland|冰岛|Akureyri|阿克雷里/i.test(s))).toBe(true);
      }
    });

    it('POI 少于天数时单日单槽按块状铺开（非 A/B 交替），每日仍为具名 POI', async () => {
      const request = {
        request_id: 'req-sparse',
        destination: 'Iceland',
        days: 7,
        start_date: '2025-07-01',
      } as any;
      const pois = [{ poi_id: 'p1', name: 'Alpha景點' }, { poi_id: 'p2', name: 'Beta景點' }];
      const result = await service.generateIncremental({
        request,
        research_data: { poi_evidence: { pois } },
        minDaysToTrigger: 3,
      });
      expect(result.itinerary.days).toHaveLength(7);
      const leadNames = result.itinerary.days.map(
        (d) => d.items.find((it: any) => it.type === 'POI')?.location_ref?.name,
      );
      for (const d of result.itinerary.days) {
        expect(d.items.length).toBeGreaterThanOrEqual(1);
        const poiItem = d.items.find((it: any) => it.type === 'POI');
        expect(poiItem?.location_ref?.name).toMatch(/Alpha景點|Beta景點/);
      }
      // 2 POIs × 7 days → floor(day*2/7): 前 4 天 p1，后 3 天 p2
      expect(leadNames.slice(0, 4)).toEqual(['Alpha景點', 'Alpha景點', 'Alpha景點', 'Alpha景點']);
      expect(leadNames.slice(4)).toEqual(['Beta景點', 'Beta景點', 'Beta景點']);
      // 连续同日参考点应有复用说明
      expect(result.itinerary.days[1].items.find((it: any) => it.type === 'POI')?.notes).toBeDefined();
      const day7 = result.itinerary.days[6];
      const restPlaceholder = day7.items.some((it: any) => it.type === 'REST' && it.location_ref?.name === '待安排');
      expect(restPlaceholder).toBe(false);
    });

    it('sparsePoiDayAllocation=round_robin 时单日单槽按日轮替（用餐/节奏类规划）', async () => {
      const request = {
        request_id: 'req-rr',
        destination: 'Iceland',
        days: 7,
        start_date: '2025-07-01',
      } as any;
      const pois = [{ poi_id: 'p1', name: 'Alpha景點' }, { poi_id: 'p2', name: 'Beta景點' }];
      const result = await service.generateIncremental({
        request,
        research_data: { poi_evidence: { pois } },
        minDaysToTrigger: 3,
        sparsePoiDayAllocation: 'round_robin',
      });
      const leadNames = result.itinerary.days.map(
        (d) => d.items.find((it: any) => it.type === 'POI')?.location_ref?.name,
      );
      expect(leadNames).toEqual([
        'Alpha景點',
        'Beta景點',
        'Alpha景點',
        'Beta景點',
        'Alpha景點',
        'Beta景點',
        'Alpha景點',
      ]);
    });

    it('优先使用 poi_evidence.slots_by_day 作为当日槽位（合并 catalog 中的完整 POI）', async () => {
      const request = {
        request_id: 'req-slots',
        destination: 'Iceland',
        days: 3,
        start_date: '2025-07-01',
      } as any;
      const pois = [
        { poi_id: 'p1', name: 'Alpha', evidence_id: 'e1' },
        { poi_id: 'p2', name: 'Beta', evidence_id: 'e2' },
      ];
      const result = await service.generateIncremental({
        request,
        research_data: {
          poi_evidence: {
            pois,
            slots_by_day: [[{ poi_id: 'p2' }], [{ poi_id: 'p1' }], [{ poi_id: 'p1' }]],
          },
        },
        minDaysToTrigger: 3,
      });
      const names = result.itinerary.days.map((d) => d.items.find((it: any) => it.type === 'POI')?.location_ref?.name);
      expect(names).toEqual(['Beta', 'Alpha', 'Alpha']);
      const meta0 = result.itinerary.days[0].items.find((it: any) => it.type === 'POI')?.metadata as any;
      expect(meta0?.slot_source).toBe('research_schedule');
      expect(meta0?.time_source).toBe('heuristic');
    });

    it('时间窗优先 POI 字段，其次 opening_hours_evidence', async () => {
      const request = {
        request_id: 'req-oh',
        destination: 'Iceland',
        days: 3,
        start_date: '2025-07-01',
      } as any;
      const pois = [
        {
          poi_id: 'p1',
          name: 'WithWindows',
          start_window: '10:30',
          end_window: '12:00',
          evidence_id: 'e1',
        },
        { poi_id: 'p2', name: 'FromHours', evidence_id: 'e2' },
        { poi_id: 'p3', name: 'HeuristicOnly', evidence_id: 'e3' },
      ];
      const result = await service.generateIncremental({
        request,
        research_data: {
          poi_evidence: { pois },
          opening_hours_evidence: {
            opening_hours: [{ poi_id: 'p2', open_time: '14:00', close_time: '19:00', evidence_id: 'oh2' }],
          },
        },
        minDaysToTrigger: 3,
      });
      const d0 = result.itinerary.days[0].items.filter((it: any) => it.type === 'POI');
      expect(d0[0].start_window).toBe('10:30');
      expect(d0[0].end_window).toBe('12:00');
      expect((d0[0].metadata as any)?.time_source).toBe('poi_evidence');
      const d1lead = result.itinerary.days[1].items.find((it: any) => it.type === 'POI');
      expect(d1lead?.location_ref?.name).toBe('FromHours');
      expect(d1lead?.start_window).toBe('14:00');
      expect((d1lead?.metadata as any)?.time_source).toBe('opening_hours_evidence');
      const d2lead = result.itinerary.days[2].items.find((it: any) => it.type === 'POI');
      expect(d2lead?.location_ref?.name).toBe('HeuristicOnly');
      expect((d2lead?.metadata as any)?.time_source).toBe('heuristic');
    });
  });
});
