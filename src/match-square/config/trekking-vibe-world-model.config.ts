/**
 * PRD 3.10 — Premium Trekking 剧本 → TripNARA World Model / 离线 DEM / DNA 权重映射
 *
 * `live` = 已有 RouteDirection + HikingOfflinePack / hard-trek hook
 * `planned` = 语义已锁定，待 GIS fixture 落地（川西/雨崩/浙西）
 */

import type { PremiumTrekkingScriptId } from './premium-trekking.config';
import type {
  TrekkingDnaEvolutionHints,
  TrekkingEventStreamMilestone,
  TrekkingRouteCandidate,
  TrekkingSharedGearDeficit,
  TrekkingToolchainItem,
  TrekkingWorldModelProfile,
} from '../types/trekking-vibe-orchestration.types';

export interface TrekkingScriptWorldModelBinding {
  scriptId: PremiumTrekkingScriptId;
  profile: TrekkingWorldModelProfile;
  routeDirectionCandidates: TrekkingRouteCandidate[];
  offlineDataPreloadRequired: boolean;
  demGridMetres: 12.5 | 20 | null;
  physicalConstraints: readonly string[];
  sharedGearDeficits: TrekkingSharedGearDeficit[];
  eventStreamMilestones: TrekkingEventStreamMilestone[];
  toolchain: TrekkingToolchainItem[];
  dnaEvolution: TrekkingDnaEvolutionHints;
  structuralMatch: {
    filterNegativeTags: readonly string[];
    preferSlotMbtiTypes: boolean;
    requireHighSecurity: boolean;
  };
}

export const TREKKING_SCRIPT_WORLD_MODEL_BINDINGS: Record<
  PremiumTrekkingScriptId,
  TrekkingScriptWorldModelBinding
> = {
  iceland_laugavegur_heavy_trek: {
    scriptId: 'iceland_laugavegur_heavy_trek',
    profile: 'heavy_offline_dem',
    routeDirectionCandidates: [
      {
        routeDirectionName: 'IS_LAUGAVEGUR',
        labelZh: '兰格维格 55km · Landmannalaugar → Þórsmörk',
        availability: 'live',
        offlinePackKey: 'is-laugavegur',
        destinationSubScopeId: 'iceland',
      },
      {
        routeDirectionName: 'IS_TREKKING_WILDERNESS',
        labelZh: '冰岛内陆 F路走廊（离线 DEM 参考 · live）',
        availability: 'live',
        offlinePackKey: 'is-trekking-wilderness',
        destinationSubScopeId: 'iceland',
      },
    ],
    offlineDataPreloadRequired: true,
    demGridMetres: 12.5,
    physicalConstraints: [
      'self_supported_camping',
      'dem_digital_elevation',
      'glacier_river_ford',
      'risk_self_managed',
      'offline_maps_required',
      'highlands_isolation',
      'country_code_IS',
    ],
    sharedGearDeficits: [
      { item: '涉水鞋/高强徒步杖', reason: 'Fjórðungakvísl 等冰川融水强涉水 · 刚性检查' },
      { item: '四季超轻帐篷', reason: '内陆极端暴风雪 Plan B · 失温兜底' },
      { item: '失温应急/LNT 套件', reason: '高寒重装 · 无痕山林与物理救援对齐' },
    ],
    eventStreamMilestones: [
      {
        slot: 'pre_dawn',
        eventId: 'fjordungakvisl_ford_gear_check',
        label: '🥾 涉水鞋/徒步杖刚性检查',
        condition: 'milestone:fjordungakvisl_river',
      },
      {
        slot: 'pre_dawn',
        eventId: 'glacier_melt_ford_window',
        label: '🌊 涉水时间窗预测（清晨低温、流量最小时通过）',
        condition: 'weather:low_melt_window',
      },
    ],
    toolchain: [
      {
        toolId: 'offline_gis_pack',
        label: '兰格维格 3D 矢量拓扑 + 12.5m DEM 等高线',
        trigger: 'vibe_chip:dem_blind_nav',
      },
      {
        toolId: 'pace_safety_corridor',
        label: 'GPS 配速安全线 · 内陆断网盲导',
        trigger: 'vibe_chip:dem_blind_nav',
      },
      {
        toolId: 'glacier_ford_planner',
        label: '冰川融水涉水时间窗预测',
        trigger: 'vibe_chip:glacier_river_ford',
      },
    ],
    dnaEvolution: {
      teamworkModel: 'Co-Creation',
      ambiguityToleranceHint: 'minimize',
      socialMatchingHint:
        '熔断拖延症/丢三落四/行中越界负反馈；优先 ISTP/INTJ 拼图位 · 数据洁癖同频',
      postTripConfirmTrigger: 'laugavegur_offline_nav_confirmed',
      preferenceEvolutionReasonPlanned: 'TREK_READINESS_ACK',
      odysseyWeightAdjustments: [
        {
          dimension: 'ambiguity_tolerance',
          direction: 'decrease',
          rationale: '冰岛内陆重装 · 极高硬度计划性与数据依赖',
        },
      ],
    },
    structuralMatch: {
      filterNegativeTags: ['procrastination', 'flaky_history', 'gear_chaos', 'boundary_violation'],
      preferSlotMbtiTypes: true,
      requireHighSecurity: true,
    },
  },
  chuanxi_heavy_trek: {
    scriptId: 'chuanxi_heavy_trek',
    profile: 'heavy_offline_dem',
    routeDirectionCandidates: [
      {
        routeDirectionName: 'CHUANXI_HEAVY_LOOP',
        labelZh: '川西长坪沟—毕棚沟 / 贡嘎大环线重装',
        availability: 'planned',
        destinationSubScopeId: 'chuanxi',
      },
    ],
    offlineDataPreloadRequired: true,
    demGridMetres: 12.5,
    physicalConstraints: [
      'self_supported_camping',
      'dem_digital_elevation',
      'risk_self_managed',
      'offline_maps_required',
      'high_altitude_exposure',
    ],
    sharedGearDeficits: [
      { item: '卫星电话', reason: '自负重野营 · 高海拔失温/断网兜底' },
      { item: '四季超轻帐篷', reason: '暴风雪 Plan B · 公摊装备缺位提醒' },
      { item: 'LNT 急救/绳索套件', reason: '硬核重装 · 物理救援能力对齐' },
    ],
    eventStreamMilestones: [],
    toolchain: [
      {
        toolId: 'offline_gis_pack',
        label: '离线 GIS 矢量瓦片 + DEM 预载',
        trigger: 'vibe_chip:dem_digital_elevation',
      },
      {
        toolId: 'shared_gear_checklist',
        label: '公摊装备缺位清单',
        trigger: 'vibe_chip:self_supported_camping',
      },
    ],
    dnaEvolution: {
      teamworkModel: 'Co-Creation',
      ambiguityToleranceHint: 'minimize',
      socialMatchingHint: '熔断拖延症/丢三落四历史负反馈；优先 ISTP/INTJ 拼图位',
      postTripConfirmTrigger: 'hard_trek_readiness_ack',
      preferenceEvolutionReasonPlanned: 'TREK_READINESS_ACK',
      odysseyWeightAdjustments: [
        {
          dimension: 'ambiguity_tolerance',
          direction: 'decrease',
          rationale: '高硬度重装计划 · 队长控制欲 C↑',
        },
      ],
    },
    structuralMatch: {
      filterNegativeTags: ['procrastination', 'flaky_history', 'gear_chaos'],
      preferSlotMbtiTypes: true,
      requireHighSecurity: true,
    },
  },
  light_trek_dyl_retreat: {
    scriptId: 'light_trek_dyl_retreat',
    profile: 'light_dyl_retreat',
    routeDirectionCandidates: [
      {
        routeDirectionName: 'YUBENG_LIGHT_MULE',
        labelZh: '雨崩神瀑/冰湖轻装马帮线',
        availability: 'planned',
        destinationSubScopeId: 'yubeng',
      },
      {
        routeDirectionName: 'WUSUN_LIGHT_TRAIL',
        labelZh: '乌孙古道轻装 · 天堂湖发呆线',
        availability: 'planned',
        destinationSubScopeId: 'xinjiang',
      },
    ],
    offlineDataPreloadRequired: false,
    demGridMetres: null,
    physicalConstraints: ['light_pack_mule', 'slow_pace', 'psychological_safe_space'],
    sharedGearDeficits: [],
    eventStreamMilestones: [
      {
        slot: 'evening',
        eventId: 'starry_dyl_canvas',
        label: '🌌 星空围炉 · DYL 人生复盘画布局',
        condition: 'camp_weather_clear',
      },
    ],
    toolchain: [
      {
        toolId: 'dyl_canvas_electronic',
        label: 'Stanford DYL 电子版卡牌',
        trigger: 'vibe_chip:dyl_life_design',
      },
      {
        toolId: 'mbti_team_complement_lens',
        label: 'MBTI 团队互补透镜',
        trigger: 'vibe_chip:starry_bonfire',
      },
    ],
    dnaEvolution: {
      teamworkModel: 'Co-Creation',
      ambiguityToleranceHint: 'co_create',
      socialMatchingHint: '过滤爹味说教/职场撕逼；优先 INFJ/ENFP 高倾听带宽',
      postTripConfirmTrigger: 'dyl_session_completed',
      preferenceEvolutionReasonPlanned: 'TREK_VIBE_CONFIRMED',
      odysseyWeightAdjustments: [
        {
          dimension: 'social_drive',
          direction: 'increase',
          rationale: 'DYL 围炉 · 社交带宽拉满但拒绝低质量社交',
        },
      ],
    },
    structuralMatch: {
      filterNegativeTags: ['preachy', 'workplace_gossip', 'ok_burn_rant'],
      preferSlotMbtiTypes: true,
      requireHighSecurity: true,
    },
  },
  weekend_fast_light_trek: {
    scriptId: 'weekend_fast_light_trek',
    profile: 'fast_light_sprint',
    routeDirectionCandidates: [
      {
        routeDirectionName: 'HZ_TRAIL_SPRINT',
        labelZh: '浙西三尖 / 径山古道 Fast&Light 速攀',
        availability: 'planned',
        destinationSubScopeId: 'hangzhou_trails',
      },
    ],
    offlineDataPreloadRequired: false,
    demGridMetres: null,
    physicalConstraints: [
      'single_day_burst',
      'hr_zone_4',
      'minimal_social_overhead',
      'no_hotel_ledger',
    ],
    sharedGearDeficits: [
      { item: '轻量化越野背包', reason: 'Fast&Light 单日爆发 · 起点补给建议' },
      { item: '能量胶/电解质', reason: '心率 160+ 配速区间 · 行中补能' },
    ],
    eventStreamMilestones: [
      {
        slot: 'finish',
        eventId: 'basecamp_craft_beer',
        label: '🍺 下山精酿 · 原地解散',
      },
    ],
    toolchain: [
      {
        toolId: 'hourly_weather_pace',
        label: '小时级气象 + 配速区间计算器',
        trigger: 'vibe_chip:hr_max_out',
      },
      {
        toolId: 'finish_poi_craft_beer',
        label: '终点精酿 POI 一键关联',
        trigger: 'vibe_chip:basecamp_craft_beer',
      },
    ],
    dnaEvolution: {
      teamworkModel: 'Improvisational',
      ambiguityToleranceHint: 'silent_flow',
      socialMatchingHint: '隐性屏蔽高能耗社交/爱拍照搭子；优先 ISTJ/INTP 沉默默契',
      postTripConfirmTrigger: 'silent_sprint_five_star',
      preferenceEvolutionReasonPlanned: 'TREK_POST_RATING_FIVE_STAR',
      odysseyWeightAdjustments: [
        {
          dimension: 'social_recharge',
          direction: 'decrease',
          rationale: '高阶沉默速攀 · 低社交能耗容忍',
        },
      ],
    },
    structuralMatch: {
      filterNegativeTags: ['high_social_energy', 'photo_spam', 'small_talk_heavy'],
      preferSlotMbtiTypes: true,
      requireHighSecurity: false,
    },
  },
};

export const TREKKING_OFFLINE_PRELOAD_CHIP_IDS = new Set([
  'dem_digital_elevation',
  'dem_blind_nav',
  'dem_survey',
  'self_supported_camping',
  'risk_self_managed',
  'chuanxi_heavy_trek',
  'iceland_laugavegur_heavy_trek',
  'laugavegur_55km',
]);

export function resolveTrekkingWorldModelBinding(
  scriptId: string | null | undefined,
): TrekkingScriptWorldModelBinding | null {
  if (!scriptId) return null;
  return TREKKING_SCRIPT_WORLD_MODEL_BINDINGS[scriptId as PremiumTrekkingScriptId] ?? null;
}
