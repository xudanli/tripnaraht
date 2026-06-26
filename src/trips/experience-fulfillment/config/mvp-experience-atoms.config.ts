/**
 * MVP Experience Atom 注册表 — Iceland MVP（PRD §8.2 + §15）
 */

import type { ExperienceAtomDefinition, ExperienceAtomRelation } from '../types/experience-atom.types';

export const MVP_EXPERIENCE_ATOM_REGISTRY: Record<
  ExperienceAtomDefinition['code'],
  ExperienceAtomDefinition
> = {
  EPIC_WATERFALL: {
    code: 'EPIC_WATERFALL',
    displayNameZh: '史诗级瀑布冲击',
    displayNameEn: 'Epic waterfall impact',
    definition: '大尺度、力量感、强视觉冲击的瀑布体验',
    userExpressions: ['大瀑布', '震撼瀑布', 'epic waterfall', 'powerful falls'],
    positiveSignals: ['high_flow', 'wide_cascade', 'mist_spray', 'scale_monumental'],
    negativeSignals: ['trickle', 'crowded_viewpoint', 'fenced_only'],
    conditionModifiers: [
      {
        condition: 'winter_ice_cover',
        strengthMultiplier: 1.1,
        note: '冰瀑形态增强视觉冲击',
      },
    ],
    relatedAtoms: ['CINEMATIC_PHOTOGRAPHY', 'REMOTE_WORLD_EDGE'],
    conflictingAtoms: ['LOW_EFFORT_NATURE'],
    inspirationLanguage: '站在瀑布前，感受水力的压迫与轰鸣',
  },
  REMOTE_WORLD_EDGE: {
    code: 'REMOTE_WORLD_EDGE',
    displayNameZh: '世界尽头感',
    displayNameEn: 'Remote world-edge feeling',
    definition: '边界感、荒野感、远离城市的尽头体验',
    userExpressions: [
      '世界尽头',
      '尽头感',
      '荒野',
      'world edge',
      'end of the world',
      'remote',
    ],
    positiveSignals: ['open_horizon', 'minimal_human_trace', 'coastal_cliff', 'vast_scale'],
    negativeSignals: ['urban_skyline', 'busy_parking', 'commercial_strip'],
    conditionModifiers: [
      {
        condition: 'low_crowd_morning',
        strengthMultiplier: 1.15,
        note: '清晨人少增强孤独与边界感',
      },
    ],
    relatedAtoms: ['WILD_COAST_SOLITUDE', 'CINEMATIC_PHOTOGRAPHY'],
    conflictingAtoms: ['SLOW_TRAVEL_RELAXATION'],
    inspirationLanguage: '风吹过黑沙滩的世界尽头',
  },
  CINEMATIC_PHOTOGRAPHY: {
    code: 'CINEMATIC_PHOTOGRAPHY',
    displayNameZh: '电影感摄影',
    displayNameEn: 'Cinematic photography',
    definition: '具备强构图、光影和叙事画面的拍摄体验',
    userExpressions: [
      '电影感',
      '拍照',
      '摄影',
      '出片',
      'cinematic',
      'photography',
      'sunrise',
      'sunset',
    ],
    positiveSignals: ['strong_composition', 'dramatic_light', 'leading_lines', 'color_contrast'],
    negativeSignals: ['flat_light_midday', 'no_view_angle'],
    conditionModifiers: [
      {
        condition: 'golden_hour',
        strengthMultiplier: 1.2,
      },
      {
        condition: 'overcast_flat_light',
        strengthMultiplier: 0.7,
      },
    ],
    relatedAtoms: ['REMOTE_WORLD_EDGE', 'EPIC_WATERFALL'],
    conflictingAtoms: [],
    inspirationLanguage: '光影落在峡湾上的那一帧',
  },
  HEALING_HOT_SPRING: {
    code: 'HEALING_HOT_SPRING',
    displayNameZh: '温泉治愈',
    displayNameEn: 'Healing hot spring',
    definition: '身体放松、低刺激、恢复感的地热温泉体验',
    userExpressions: ['温泉', '放松', '治愈', 'hot spring', 'spa', 'geothermal bath'],
    positiveSignals: ['warm_water', 'steam', 'low_stimulus', 'recovery'],
    negativeSignals: ['crowded_pool', 'strong_sulfur_smell_averse'],
    conditionModifiers: [
      {
        condition: 'winter_cold_air',
        strengthMultiplier: 1.15,
        note: '冷暖对比增强治愈感',
      },
    ],
    relatedAtoms: ['SLOW_TRAVEL_RELAXATION', 'LOW_EFFORT_NATURE'],
    conflictingAtoms: ['GLACIER_ADVENTURE'],
    inspirationLanguage: '雾气升腾中的地热池',
  },
  WILD_COAST_SOLITUDE: {
    code: 'WILD_COAST_SOLITUDE',
    displayNameZh: '野性海岸孤独感',
    displayNameEn: 'Wild coast solitude',
    definition: '海岸力量、低人群、自然压迫感的孤独海岸体验',
    userExpressions: ['黑沙滩', '海岸', '孤独', 'wild coast', 'black sand', 'solitude'],
    positiveSignals: ['basalt_coast', 'wave_power', 'low_crowd', 'wind_exposure'],
    negativeSignals: ['swimming_beach_crowd', 'resort_strip'],
    conditionModifiers: [
      {
        condition: 'high_wind_warning',
        disabled: true,
        note: '风浪超安全阈值时不建议前往海岸点',
      },
    ],
    relatedAtoms: ['REMOTE_WORLD_EDGE', 'CINEMATIC_PHOTOGRAPHY'],
    conflictingAtoms: ['HEALING_HOT_SPRING'],
    inspirationLanguage: '浪声与玄武岩之间的空旷',
  },
  GLACIER_ADVENTURE: {
    code: 'GLACIER_ADVENTURE',
    displayNameZh: '冰川冒险',
    displayNameEn: 'Glacier adventure',
    definition: '冰川、冰洞、专业活动和挑战性的冰川体验',
    userExpressions: [
      '冰川',
      '冰川徒步',
      '冰洞',
      'glacier',
      'ice cave',
      'glacier hike',
    ],
    positiveSignals: ['guided_glacier_access', 'ice_formations', 'adventure_activity'],
    negativeSignals: ['view_only_distant', 'season_closed'],
    conditionModifiers: [
      {
        condition: 'winter_season',
        strengthMultiplier: 0.6,
        note: '部分冰川活动冬季关闭或受限',
      },
    ],
    relatedAtoms: ['EPIC_WATERFALL'],
    conflictingAtoms: ['LOW_EFFORT_NATURE', 'SLOW_TRAVEL_RELAXATION'],
    inspirationLanguage: '踩在千年冰层上的脚步声',
  },
  LOW_EFFORT_NATURE: {
    code: 'LOW_EFFORT_NATURE',
    displayNameZh: '低体力自然体验',
    displayNameEn: 'Low-effort nature',
    definition: '少步行、易抵达、仍具强自然体验的点位',
    userExpressions: [
      '少走路',
      '低强度',
      '父母',
      '老人',
      'low effort',
      'easy walk',
      'elderly',
      '带父母',
    ],
    positiveSignals: ['short_walk', 'paved_access', 'viewpoint_near_parking'],
    negativeSignals: ['long_hike_required', 'steep_unpaved'],
    conditionModifiers: [
      {
        condition: 'mobility_limited_party',
        strengthMultiplier: 1.2,
      },
    ],
    relatedAtoms: ['SLOW_TRAVEL_RELAXATION', 'HEALING_HOT_SPRING'],
    conflictingAtoms: ['GLACIER_ADVENTURE', 'EPIC_WATERFALL'],
    inspirationLanguage: '停车步行十分钟，仍见壮阔自然',
  },
  SLOW_TRAVEL_RELAXATION: {
    code: 'SLOW_TRAVEL_RELAXATION',
    displayNameZh: '松弛慢旅行',
    displayNameEn: 'Slow travel relaxation',
    definition: '低密度、少换乘、长停留、高缓冲的松弛节奏',
    userExpressions: [
      '松弛',
      '不要太赶',
      '轻松',
      '慢旅行',
      'relaxed',
      'slow travel',
      'not rushed',
    ],
    positiveSignals: ['long_dwell_ok', 'low_transfer', 'buffer_time'],
    negativeSignals: ['packed_schedule', 'multi_hotel_hops'],
    conditionModifiers: [],
    relatedAtoms: ['LOW_EFFORT_NATURE', 'HEALING_HOT_SPRING'],
    conflictingAtoms: ['REMOTE_WORLD_EDGE'],
    inspirationLanguage: '一天只专注一片风景的留白',
  },
};

export const MVP_EXPERIENCE_ATOM_RELATIONS: readonly ExperienceAtomRelation[] = [
  { from: 'REMOTE_WORLD_EDGE', to: 'WILD_COAST_SOLITUDE', kind: 'RELATED', weight: 0.85 },
  { from: 'REMOTE_WORLD_EDGE', to: 'SLOW_TRAVEL_RELAXATION', kind: 'CONFLICTING', weight: 0.6 },
  { from: 'GLACIER_ADVENTURE', to: 'LOW_EFFORT_NATURE', kind: 'CONFLICTING', weight: 0.75 },
  { from: 'CINEMATIC_PHOTOGRAPHY', to: 'REMOTE_WORLD_EDGE', kind: 'RELATED', weight: 0.8 },
  { from: 'HEALING_HOT_SPRING', to: 'GLACIER_ADVENTURE', kind: 'CONFLICTING', weight: 0.5 },
];

export function getExperienceAtom(code: string): ExperienceAtomDefinition | undefined {
  return MVP_EXPERIENCE_ATOM_REGISTRY[code as ExperienceAtomDefinition['code']];
}

export function listMvpExperienceAtoms(): ExperienceAtomDefinition[] {
  return Object.values(MVP_EXPERIENCE_ATOM_REGISTRY);
}
