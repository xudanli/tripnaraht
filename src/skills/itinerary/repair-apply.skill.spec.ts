import { Test, TestingModule } from '@nestjs/testing';
import { RepairApplySkill } from './repair-apply.skill';

describe('RepairApplySkill', () => {
  let skill: RepairApplySkill;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RepairApplySkill],
    }).compile();
    skill = module.get<RepairApplySkill>(RepairApplySkill);
  });

  it('ADD_BUFFER + target 将相邻两 POI 中后项后移，消除重叠', async () => {
    const out = await skill.execute({
      itinerary: {
        request_id: 'r-poi-overlap',
        days: [
          {
            date: '2026-07-01',
            items: [
              {
                id: 'early',
                type: 'POI',
                start_window: '14:00',
                end_window: '16:00',
                location_ref: { place_id: 'p1', name: 'A' },
                evidence_refs: [],
              },
              {
                id: 'late',
                type: 'POI',
                start_window: '15:00',
                end_window: '17:00',
                location_ref: { place_id: 'p2', name: 'B' },
                evidence_refs: [],
              },
            ],
          },
        ],
      } as any,
      adjustments: [{ action: 'ADD_BUFFER', why: 'overlap', target: 'late' }] as any,
      alternatives: { alternative_pois: [], alternative_routes: [] },
    });

    expect(out.repaired).toBe(true);
    const late = out.itinerary.days[0].items.find((x: any) => x.id === 'late');
    expect(late.start_window).toBe('16:30');
    expect(late.end_window).toBe('18:30');
    expect(out.applied_fixes.some((f) => f.adjustment_type === 'ADD_BUFFER')).toBe(true);
  });

  it('ADD_BUFFER + target + buffer_anchor_item_id 锚定非序列紧邻的前项', async () => {
    const out = await skill.execute({
      itinerary: {
        request_id: 'r-anchor-gap',
        days: [
          {
            date: '2026-07-01',
            items: [
              {
                id: 'early',
                type: 'POI',
                start_window: '09:00',
                end_window: '10:00',
                location_ref: { place_id: 'p1', name: 'A' },
                evidence_refs: [],
              },
              {
                id: 'middle',
                type: 'POI',
                start_window: '12:00',
                end_window: '13:00',
                location_ref: { place_id: 'pm', name: 'M' },
                evidence_refs: [],
              },
              {
                id: 'late',
                type: 'POI',
                start_window: '09:30',
                end_window: '10:30',
                location_ref: { place_id: 'p2', name: 'B' },
                evidence_refs: [],
              },
            ],
          },
        ],
      } as any,
      adjustments: [
        {
          action: 'ADD_BUFFER',
          why: 'overlap with early not middle',
          target: 'late',
          buffer_anchor_item_id: 'early',
        },
      ] as any,
      alternatives: { alternative_pois: [], alternative_routes: [] },
    });

    expect(out.repaired).toBe(true);
    const late = out.itinerary.days[0].items.find((x: any) => x.id === 'late');
    expect(late.start_window).toBe('10:30');
    expect(late.end_window).toBe('11:30');
  });

  it('ADD_BUFFER + buffer_anchor_item_ids 取多锚中最晚 end', async () => {
    const out = await skill.execute({
      itinerary: {
        request_id: 'r-multi-anchor',
        days: [
          {
            date: '2026-07-01',
            items: [
              {
                id: 'early',
                type: 'POI',
                start_window: '08:00',
                end_window: '09:00',
                location_ref: { place_id: 'p1', name: 'A' },
                evidence_refs: [],
              },
              {
                id: 'middle',
                type: 'POI',
                start_window: '09:15',
                end_window: '12:00',
                location_ref: { place_id: 'pm', name: 'M' },
                evidence_refs: [],
              },
              {
                id: 'late',
                type: 'POI',
                start_window: '08:30',
                end_window: '09:30',
                location_ref: { place_id: 'p2', name: 'B' },
                evidence_refs: [],
              },
            ],
          },
        ],
      } as any,
      adjustments: [
        {
          action: 'ADD_BUFFER',
          why: 'merged overlaps',
          target: 'late',
          buffer_anchor_item_ids: ['early', 'middle'],
        },
      ] as any,
      alternatives: { alternative_pois: [], alternative_routes: [] },
    });

    expect(out.repaired).toBe(true);
    const late = out.itinerary.days[0].items.find((x: any) => x.id === 'late');
    expect(late.start_window).toBe('12:30');
    expect(late.end_window).toBe('13:30');
  });

  it('REDUCE_SCOPE_OR_ADD_EVIDENCE 应触发确定性低预算修复（缩减一天 items）', async () => {
    const out = await skill.execute({
      itinerary: {
        request_id: 'r1',
        days: [
          {
            date: '2026-07-01',
            items: [{ type: 'POI', title: 'A' }, { type: 'POI', title: 'B' }],
          },
        ],
      } as any,
      adjustments: [{ action: 'REDUCE_SCOPE_OR_ADD_EVIDENCE', why: 'meta budget too low' }] as any,
      alternatives: { alternative_pois: [], alternative_routes: [] },
    });

    expect(out.repaired).toBe(true);
    expect(out.itinerary.days[0].items).toHaveLength(1);
    expect(out.applied_fixes.some((f) => f.adjustment_type === 'REDUCE_SCOPE_OR_ADD_EVIDENCE')).toBe(true);
  });
});

