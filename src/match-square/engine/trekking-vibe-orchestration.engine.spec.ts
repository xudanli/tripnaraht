import { parseVibeFreeTextWithRules } from './vibe-llm-parse.engine';
import { buildTrekkingVibeOrchestrationPlan } from './trekking-vibe-orchestration.engine';

const CHUANXI_TEXT =
  '6月下旬去川西长坪沟穿毕棚沟重装徒步，自己背负扎营，DEM 数字高程模型已导入，遇暴风雪有 Plan B。搭子要理工科户外老炮，LNT 法则，别在雪山掉链子。';

describe('trekking-vibe-orchestration', () => {
  it('builds heavy offline DEM plan for chuanxi script', () => {
    const payload = parseVibeFreeTextWithRules(CHUANXI_TEXT);
    const plan = buildTrekkingVibeOrchestrationPlan(payload);

    expect(plan).not.toBeNull();
    expect(plan!.scriptId).toBe('chuanxi_heavy_trek');
    expect(plan!.worldModel.profile).toBe('heavy_offline_dem');
    expect(plan!.worldModel.offlineDataPreloadRequired).toBe(true);
    expect(plan!.worldModel.demGridMetres).toBe(12.5);
    expect(plan!.worldModel.routeDirectionCandidates.every((r) => r.availability === 'planned')).toBe(true);
    expect(plan!.sharedGearDeficits.length).toBeGreaterThan(0);
    expect(plan!.dnaEvolution.ambiguityToleranceHint).toBe('minimize');
    expect(plan!.toolchain.some((t) => t.toolId === 'offline_gis_pack')).toBe(true);
  });

  it('builds DYL toolchain for light trek script', () => {
    const payload = parseVibeFreeTextWithRules(
      'Feature Freeze 后去乌孙古道轻装徒步，马帮驼装备，DYL 人生设计复盘，拒绝爹味说教，星空围炉。',
    );
    const plan = buildTrekkingVibeOrchestrationPlan(payload);

    expect(plan!.scriptId).toBe('light_trek_dyl_retreat');
    expect(plan!.worldModel.profile).toBe('light_dyl_retreat');
    expect(plan!.eventStreamMilestones.some((e) => e.eventId === 'starry_dyl_canvas')).toBe(true);
    expect(plan!.toolchain.some((t) => t.toolId === 'dyl_canvas_electronic')).toBe(true);
  });

  it('builds silent sprint plan for weekend fast light', () => {
    const payload = parseVibeFreeTextWithRules(
      '6月周末浙西三尖 Fast&Light 速攀，心率160，无效社交，下山精酿解散，高阶沉默。',
    );
    const plan = buildTrekkingVibeOrchestrationPlan(payload);

    expect(plan!.scriptId).toBe('weekend_fast_light_trek');
    expect(plan!.worldModel.physicalConstraints).toContain('zero_social_itinerary');
    expect(plan!.dnaEvolution.ambiguityToleranceHint).toBe('silent_flow');
  });

  it('returns null for non-trekking vibe', () => {
    const payload = parseVibeFreeTextWithRules('去大理躺尸疗愈发呆');
    expect(buildTrekkingVibeOrchestrationPlan(payload)).toBeNull();
  });

  it('builds Laugavegur highlands plan with ford milestones for iceland script', () => {
    const payload = parseVibeFreeTextWithRules(
      '2026年盛夏冰岛兰格维格 Laugavegur 55公里重装，Landmannalaugar 彩色火山到 Þórsmörk，12.5米 DEM 离线 3D 路线，冰川融水强涉水 Fjórðungakvísl，内陆断网 Plan B LNT。',
    );
    const plan = buildTrekkingVibeOrchestrationPlan(payload);

    expect(plan!.scriptId).toBe('iceland_laugavegur_heavy_trek');
    expect(plan!.worldModel.routeDirectionCandidates[0].routeDirectionName).toBe('IS_LAUGAVEGUR');
    expect(plan!.eventStreamMilestones.some((e) => e.eventId === 'glacier_melt_ford_window')).toBe(true);
    expect(plan!.toolchain.some((t) => t.toolId === 'glacier_ford_planner')).toBe(true);
    expect(plan!.sharedGearDeficits.some((g) => g.item.includes('涉水'))).toBe(true);
  });
});
