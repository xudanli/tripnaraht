import {
  buildRepairHaltClarificationQuestion,
  detectVehicleTerrainRepairHaltConflict,
} from './build-repair-halt-clarification.util';

describe('build-repair-halt-clarification.util', () => {
  const froadIssue = {
    code: 'ROUTE_INFEASIBLE',
    class: 'CONFLICT',
    message:
      '[L3-PROOF|terrain.f_road_compatibility|OTHER:vehicle_terrain_arbitrator|cmp:LEQ|actual:|limit:|unit:|slack:|evidence:MODEL:user_query] 行程里包含冰岛 F 路或高地路段，而当前信息指向两驱/经济型车。请先改订允许上 F 路的四驱车，或改走不含 F 路的路线。',
  };

  it('detects terrain.f_road_compatibility conflict', () => {
    const hit = detectVehicleTerrainRepairHaltConflict({
      verification: { issues: [froadIssue] },
    } as any);
    expect(hit?.dominantCid).toBe('terrain.f_road_compatibility');
    expect(hit?.messageZh).toContain('四驱');
    expect(hit?.messageZh).not.toContain('[L3-PROOF');
  });

  it('budget halt with vehicle conflict exposes upgrade_vehicle_to_4wd', () => {
    const q = buildRepairHaltClarificationQuestion({
      kind: 'budget_exceeded',
      repairCount: 3,
      decisionState: { verification: { issues: [froadIssue] } } as any,
    });
    expect(q.id).toBe('repair_halt_confirmation');
    expect(q.question).toContain('车型');
    expect(q.question).toContain('四驱');
    expect(q.options?.some((o) => o.value === 'upgrade_vehicle_to_4wd')).toBe(true);
    expect(q.options?.[0]?.value).toBe('upgrade_vehicle_to_4wd');
    expect(q.metadata).toMatchObject({
      repair_halt: 'budget_exceeded',
      vehicle_terrain_conflict: true,
      dominant_cid: 'terrain.f_road_compatibility',
    });
  });

  it('generic budget halt keeps legacy options when no vehicle conflict', () => {
    const q = buildRepairHaltClarificationQuestion({
      kind: 'budget_exceeded',
      repairCount: 2,
      decisionState: {
        verification: {
          issues: [{ code: 'POI_CLOSED', class: 'ADVISORY', message: '缺开放时间' }],
        },
      } as any,
    });
    expect(q.options?.map((o) => o.value)).toEqual([
      'reduce_scope',
      'relax_constraints',
      'continue_auto_repair',
    ]);
    expect(q.question).toContain('仍未收敛');
  });
});
