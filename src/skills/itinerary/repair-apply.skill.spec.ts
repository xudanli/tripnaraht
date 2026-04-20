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

