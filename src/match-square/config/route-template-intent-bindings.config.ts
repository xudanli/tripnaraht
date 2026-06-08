/**
 * PRD 3.11 — 招募剧本 / 目的地 → 路线模板目录（配置驱动）
 *
 * `routeTemplateId` 在 DB 种子落地前用 catalogId + routeDirectionName 解析；
 * spawn / create-trip-from-template 阶段再查 Prisma RouteTemplate。
 */

import type { RouteTemplateIntentCatalogEntry } from '../types/route-template-intent.types';

export const ROUTE_TEMPLATE_HIGHLIGHT_THRESHOLD = 0.85;
export const ROUTE_TEMPLATE_SUGGEST_THRESHOLD = 0.6;

export const ROUTE_TEMPLATE_INTENT_CATALOG: readonly RouteTemplateIntentCatalogEntry[] = [
  {
    catalogId: 'is_laugavegur_55km_heavy_4d',
    routeDirectionName: 'IS_LAUGAVEGUR',
    durationDays: 4,
    titleZh: '冰岛内陆兰格维格 55km 硬核重装 4日',
    subtitleZh: 'Landmannalaugar → Þórsmörk · 12.5m DEM 离线盲导',
    matchKeywords: [
      '兰格维格',
      'Laugavegur',
      'Landmannalaugar',
      'Þórsmörk',
      'Thorsmork',
      '冰岛内陆',
      '55公里',
      '55km',
      '重装',
      'DEM',
      '冰川涉水',
      'Fjórðungakvísl',
    ],
    recruitmentScriptIds: ['iceland_laugavegur_heavy_trek'],
    destinationSubScopeIds: ['iceland'],
    physicalConstraints: [
      'glacier_river_ford',
      'self_supported_camping',
      'offline_dem_12_5m',
      'highlands_isolation',
    ],
    slotAugmentations: [
      {
        slotRole: 'gear_rescue',
        expectedTagSuffix: '涉水/高寒物理救援',
        reason: '兰格维格模板含多处冰川融水强涉水，需硬核物理输出补位',
      },
      {
        slotRole: 'weather_nav',
        expectedTagSuffix: '离线气象精算',
        reason: '内陆狂风暴雪熔断点须与队长同频数据决策',
      },
    ],
    vaultMilestoneIds: ['hut_landmannalaugar', 'fjordungakvisl_ford', 'hut_thorsmork'],
    autoSuggestThreshold: 0.85,
  },
  {
    catalogId: 'anji_dna_light_camp_3d',
    routeDirectionName: 'ANJI_DNA_RETREAT',
    durationDays: 3,
    titleZh: '安吉 DNA 数字游民公社 · 周边山野轻量化徒步与星空营地 3日',
    subtitleZh: '白天远程 · 傍晚山谷露营 · 围炉 DYL 人生复盘',
    matchKeywords: [
      '安吉',
      'DNA',
      '数字游民',
      'DYL',
      '设计人生',
      '山谷',
      '围炉',
      '星空',
      '露营',
      '班味',
      'Feature Freeze',
    ],
    recruitmentScriptIds: ['mountain_dyl_retreat', 'light_trek_dyl_retreat'],
    destinationSubScopeIds: ['anji', 'zhejiang'],
    physicalConstraints: ['light_pack', 'slow_pace', 'psychological_safe_space', 'dyl_evening'],
    slotAugmentations: [
      {
        slotRole: 'dye_listener',
        expectedTagSuffix: '高倾听带宽精神摆渡',
        reason: 'DYL 围炉复盘需极高同理心，拒绝爹味说教',
      },
    ],
    vaultMilestoneIds: ['anji_dna_base', 'valley_camp_evening', 'dyl_canvas_night'],
    autoSuggestThreshold: 0.85,
  },
  {
    catalogId: 'chuanxi_heavy_loop_planned',
    routeDirectionName: 'CHUANXI_HEAVY_LOOP',
    durationDays: 5,
    titleZh: '川西长坪沟—毕棚沟 / 贡嘎大环线重装',
    subtitleZh: '自负重扎营 · DEM 高程 · 待 GIS fixture 上线',
    matchKeywords: ['川西', '长坪沟', '毕棚沟', '贡嘎', '重装', 'DEM', '自负重'],
    recruitmentScriptIds: ['chuanxi_heavy_trek'],
    destinationSubScopeIds: ['chuanxi'],
    physicalConstraints: ['self_supported_camping', 'dem_digital_elevation', 'high_altitude_exposure'],
    slotAugmentations: [
      {
        slotRole: 'gear_rescue',
        expectedTagSuffix: '荒野物理输出/应急',
        reason: '川西重装模板含高海拔失温与暴风雪 Plan B 节点',
      },
    ],
    vaultMilestoneIds: [],
    autoSuggestThreshold: 0.85,
  },
];

export function listRouteTemplateCatalogForScript(
  scriptId: string | null | undefined,
): RouteTemplateIntentCatalogEntry[] {
  if (!scriptId) return [...ROUTE_TEMPLATE_INTENT_CATALOG];
  return ROUTE_TEMPLATE_INTENT_CATALOG.filter(
    (e) => !e.recruitmentScriptIds?.length || e.recruitmentScriptIds.includes(scriptId),
  );
}
