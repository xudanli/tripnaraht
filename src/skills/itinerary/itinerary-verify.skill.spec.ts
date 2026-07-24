import { Test, TestingModule } from '@nestjs/testing';
import { ItineraryVerifySkill } from './itinerary-verify.skill';
import { createSafeTravelEvidence } from './safetravel-verify-evidence.util';
import { VERIFY_SHADOW_CLOSURE_PROPAGATION_V0 } from './temporal-shadow-closure.util';

describe('ItineraryVerifySkill', () => {
  it('冰岛车型–路况仲裁：F-road 信号 + 经济型租车 → CRITICAL REACHABILITY_ISSUE', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItineraryVerifySkill],
    }).compile();
    const verify = module.get(ItineraryVerifySkill);

    const out = await verify.execute({
      itinerary: {
        request_id: 'is-froad',
        days: [
          {
            date: '2026-08-01',
            items: [
              {
                id: 'leg1',
                type: 'TRANSPORT' as const,
                notes: 'F208 inland',
                evidence_refs: [],
              },
            ],
          },
        ],
      } as any,
      research_data: {
        country_code: 'IS',
        car_rentals: [{ name: 'Economy', vehicle_class: 'economy' }],
      },
    });

    expect(out.issues.some((i) => i.severity === 'CRITICAL' && i.message.includes('F 路'))).toBe(true);
  });

  it('有 item.metadata.opening_hours 时不报「缺少开放时间数据」', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItineraryVerifySkill],
    }).compile();
    const verify = module.get(ItineraryVerifySkill);

    const out = await verify.execute({
      itinerary: {
        request_id: 'oh-meta',
        days: [
          {
            date: '2026-06-01',
            items: [
              {
                id: 'vik-shop',
                type: 'POI' as const,
                start_window: '10:00',
                end_window: '12:00',
                location_ref: { place_id: '381073', name: '维克超市' },
                metadata: { opening_hours: '10:00-22:00', time_source: 'poi_evidence' },
                evidence_refs: [],
              },
            ],
          },
        ],
      } as any,
      research_data: {
        opening_hours_evidence: [{ poi_id: '381073', opening_hours: null }],
      },
    });

    expect(
      out.issues.some((i) => i.message.includes('维克超市') && i.message.includes('缺少开放时间')),
    ).toBe(false);
  });

  it('夏季行程：Summer/Winter 季节性文案在 11:30 不误报 OPENING_HOURS_CONFLICT', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItineraryVerifySkill],
    }).compile();
    const verify = module.get(ItineraryVerifySkill);

    const seasonalHours = 'Summer 8:00-18:00, Winter 9:00-17:00';
    const out = await verify.execute({
      itinerary: {
        request_id: 'oh-seasonal',
        days: [
          {
            date: '2026-06-02',
            items: [
              {
                id: 'skaftafell',
                type: 'POI' as const,
                start_window: '11:30',
                end_window: '14:00',
                location_ref: { place_id: '381041', name: '斯卡夫塔山国家公园' },
                evidence_refs: [],
              },
            ],
          },
        ],
      } as any,
      research_data: {
        country_code: 'IS',
        opening_hours_evidence: [{ poi_id: '381041', opening_hours: seasonalHours }],
      },
    });

    expect(
      out.issues.some(
        (i) =>
          i.type === 'OPENING_HOURS_CONFLICT' &&
          i.severity === 'ERROR' &&
          i.message.includes('斯卡夫塔山国家公园'),
      ),
    ).toBe(false);
  });

  it('夏季行程：早于 Summer 开门时刻仍报 OPENING_HOURS_CONFLICT', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItineraryVerifySkill],
    }).compile();
    const verify = module.get(ItineraryVerifySkill);

    const out = await verify.execute({
      itinerary: {
        request_id: 'oh-seasonal-early',
        days: [
          {
            date: '2026-06-02',
            items: [
              {
                id: 'skaftafell',
                type: 'POI' as const,
                start_window: '07:00',
                end_window: '09:00',
                location_ref: { place_id: '381041', name: '斯卡夫塔山国家公园' },
                evidence_refs: [],
              },
            ],
          },
        ],
      } as any,
      research_data: {
        country_code: 'IS',
        opening_hours_evidence: [
          {
            poi_id: '381041',
            opening_hours: { description: 'Summer 8:00-18:00, Winter 9:00-17:00' },
          },
        ],
      },
    });

    expect(
      out.issues.some(
        (i) =>
          i.type === 'OPENING_HOURS_CONFLICT' &&
          i.severity === 'ERROR' &&
          i.message.includes('斯卡夫塔山国家公园') &&
          i.message.includes('07:00'),
      ),
    ).toBe(true);
  });

  it('全天开放景点在 14:55 不误报 OPENING_HOURS_CONFLICT', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItineraryVerifySkill],
    }).compile();
    const verify = module.get(ItineraryVerifySkill);

    const out = await verify.execute({
      itinerary: {
        request_id: 'oh-24h',
        days: [
          {
            date: '2026-06-03',
            items: [
              {
                id: 'diamond-beach',
                type: 'POI' as const,
                start_window: '14:55',
                end_window: '16:15',
                location_ref: { place_id: '381099', name: '钻石沙滩' },
                evidence_refs: [],
              },
            ],
          },
        ],
      } as any,
      research_data: {
        country_code: 'IS',
        opening_hours_evidence: [{ poi_id: '381099', opening_hours: '全天开放' }],
      },
    });

    expect(
      out.issues.some(
        (i) =>
          i.type === 'OPENING_HOURS_CONFLICT' &&
          i.severity === 'ERROR' &&
          i.message.includes('钻石沙滩'),
      ),
    ).toBe(false);
  });

  it('TIME_WINDOW_OVERLAP 携带 related_item_id（重叠对中的前项）', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItineraryVerifySkill],
    }).compile();
    const verify = module.get(ItineraryVerifySkill);

    const out = await verify.execute({
      itinerary: {
        request_id: 'overlap-meta',
        days: [
          {
            date: '2026-07-01',
            items: [
              {
                id: 'early',
                type: 'POI' as const,
                start_window: '09:00',
                end_window: '10:00',
                location_ref: { place_id: 'p1', name: 'A' },
                evidence_refs: [],
              },
              {
                id: 'middle',
                type: 'POI' as const,
                start_window: '12:00',
                end_window: '13:00',
                location_ref: { place_id: 'pm', name: 'M' },
                evidence_refs: [],
              },
              {
                id: 'late',
                type: 'POI' as const,
                start_window: '09:30',
                end_window: '10:30',
                location_ref: { place_id: 'p2', name: 'B' },
                evidence_refs: [],
              },
            ],
          },
        ],
      } as any,
    });

    const overlaps = out.issues.filter((i) => i.type === 'TIME_WINDOW_OVERLAP' && i.severity === 'ERROR');
    expect(overlaps.length).toBeGreaterThanOrEqual(1);
    const ac = overlaps.find((i) => i.item_id === 'late' && i.related_item_id === 'early');
    expect(ac).toBeDefined();
  });

  it('冰岛保险仲裁：Vík 行程 + 租车摘录无 SAAP → INFO saap_gap 计入 info_count', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItineraryVerifySkill],
    }).compile();
    const verify = module.get(ItineraryVerifySkill);

    const out = await verify.execute({
      itinerary: {
        request_id: 'is-vik-saap',
        days: [
          {
            date: '2026-08-02',
            items: [
              {
                id: 'stay-vik',
                type: 'ACCOMMODATION' as const,
                notes: 'overnight near Vík',
                evidence_refs: [],
                location_ref: { name: 'Vík', place_id: 'vik' },
              },
            ],
          },
        ],
      } as any,
      research_data: {
        country_code: 'IS',
        car_rentals: [{ provider: 'Lotus', insurance_text: 'CDW + TP, basic excess' }],
      },
    });

    const saap = out.issues.find((i) => i.violation?.anchor.ruleId?.includes('saap_gap'));
    expect(saap).toBeDefined();
    expect(saap?.severity).toBe('INFO');
    expect(out.summary.info_count).toBeGreaterThanOrEqual(1);
  });

  it('Verify V2 只读：SafeTravel segment 对齐后写入 closure_shadow + verify_shadow', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItineraryVerifySkill],
    }).compile();
    const verify = module.get(ItineraryVerifySkill);

    const ev = createSafeTravelEvidence({ segmentRef: 'ring-road:test-seg', severity: 'critical' });
    const itineraryInput = {
      request_id: 'shadow-v0',
      days: [
        {
          date: '2026-08-10',
          items: [
            {
              id: 'leg',
              type: 'DRIVE' as const,
              start_window: '08:00',
              end_window: '11:00',
              location_ref: { name: 'Along ring' },
              evidence_refs: [],
              metadata: { route_segment_ref: 'ring-road:test-seg' },
            },
          ],
        },
      ],
    } as any;

    const result = await verify.execute({
      itinerary: itineraryInput,
      research_data: { country_code: 'IS', ...ev },
    });

    const leg = itineraryInput.days[0].items[0];
    expect(leg.metadata?.closure_shadow?.cut_point).toBe(true);
    expect(leg.metadata?.closure_shadow?.route_segment_ref).toBe('ring-road:test-seg');
    expect(itineraryInput.metadata?.verify_shadow?.[VERIFY_SHADOW_CLOSURE_PROPAGATION_V0]).toBeDefined();
    expect(result.issues.some((i) => i.violation?.anchor.ruleId?.includes('safetravel_route_segment'))).toBe(true);
  });
});
