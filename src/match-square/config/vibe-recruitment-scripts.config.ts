/** PRD 4.3 — 招募愿景 Gold Dataset 剧本（Decision OS 语义抓取） */

import type { VibeHardGates, VibeSlotDefinition, VibeTeamworkContractModel } from '../types/vibe-llm.types';
import type { PremiumTrekkingSceneId } from './premium-trekking.config';
import { PREMIUM_TREKKING_SCENE_ID } from './premium-trekking.config';

export type VibeRecruitmentScriptId =
  | 'dopamine_escape'
  | 'polar_expedition'
  | 'iceland_laugavegur_heavy_trek'
  | 'chuanxi_heavy_trek'
  | 'light_trek_dyl_retreat'
  | 'weekend_fast_light_trek'
  | 'industrial_ruins'
  | 'island_geek_hackathon'
  | 'mountain_dyl_retreat'
  | 'dali_non_mainstream_collision';

export type VibeRecruitmentSceneCategory = PremiumTrekkingSceneId;

export interface VibeRecruitmentScriptProfile {
  id: VibeRecruitmentScriptId;
  title: string;
  detect: (text: string) => boolean;
  suppressedChipIds: ReadonlySet<string>;
  coreChipIds: readonly string[];
  teamworkModel: VibeTeamworkContractModel;
  sceneCategory?: VibeRecruitmentSceneCategory;
  buildHardGates: (text: string, inferBudgetRange: (t: string) => string | null) => VibeHardGates;
  buildSlots: () => VibeSlotDefinition[];
}

const GENERIC_SUPPRESS = [
  'deep_relax',
  'cross_energy',
  'deep_learning',
  'music_bar',
  'music_vibe',
  'mindless_float',
  'self_drive_tour',
  'wild_camping',
] as const;

function slot(
  slot_id: number,
  expected_tag: string,
  reason: string,
  targetMbtiTypes: string[],
): VibeSlotDefinition {
  return {
    slot_id,
    expected_tag,
    reason: reason.startsWith('AI:') ? reason : `AI: ${reason}`,
    targetMbtiTypes,
  };
}

export function isDopamineEscapeScript(text: string): boolean {
  const t = text.trim();
  return (
    /拒绝任何动脑|拒绝 PPT|拒绝卷|预算无上限|带我疯|电音节|livehouse|fundraising|seed 轮/.test(t) &&
    /(万宁|清迈|海南|冲浪|跳伞|敞篷|多巴胺)/.test(t)
  );
}

export function isPolarExpeditionScript(text: string): boolean {
  const t = text.trim();
  return /(南极|斯瓦尔巴|Svalbard|极昼徒步|无人冰原|科考站)/.test(t) && /(DEM|冰川|极寒|暴风雪)/.test(t);
}

export function isChuanxiHeavyTrekScript(text: string): boolean {
  const t = text.trim();
  if (/(南极|斯瓦尔巴|Svalbard)/.test(t)) return false;
  if (/(冰岛|兰格维格|Laugavegur|Landmannalaugar|兰曼纳劳卡|Þórsmörk|Thorsmork|索斯莫克)/i.test(t)) {
    return false;
  }
  return (
    /(川西|长坪沟|毕棚沟|贡嘎)/.test(t) &&
    /(重装|自负重|自己背负|扎营|保姆团|马帮全包|全包的保姆)/.test(t) &&
    /(DEM|数字高程|高程模型|离线.*路径|Plan B)/i.test(t)
  );
}

export function isIcelandLaugavegurHeavyTrekScript(text: string): boolean {
  const t = text.trim();
  return (
    /(冰岛|Iceland|兰格维格|Laugavegur|Landmannalaugar|兰曼纳劳卡|Þórsmörk|Thorsmork|索斯莫克)/i.test(t) &&
    /(重装|55\s*公里|55km|内陆.*徒步|徒步.*内陆)/i.test(t) &&
    /(DEM|数字高程|12\.5|离线.*路线|离线.*3D|Plan B|断网|LNT|无痕山林)/i.test(t)
  );
}

export function isLightTrekDylRetreatScript(text: string): boolean {
  const t = text.trim();
  if (/(安吉.*DNA|阿那亚)/.test(t)) return false;
  return (
    /(乌孙古道|雨崩|天堂湖)/.test(t) &&
    /(轻装|马帮)/.test(t) &&
    /(DYL|设计人生|人生设计|职场转型|创业复盘|Feature Freeze)/.test(t)
  );
}

export function isWeekendFastLightTrekScript(text: string): boolean {
  const t = text.trim();
  return (
    /(浙西三尖|法喜寺|十里琅珰|杭州周边|百公里越野)/.test(t) ||
    (/周末/.test(t) && /(速攀|Fast\s*&\s*Light|轻量化|心率\s*160)/i.test(t))
  ) &&
    /(沉默|边界感|无效社交|精酿|不聊大厂|默契)/.test(t);
}

export function isIndustrialRuinsScript(text: string): boolean {
  const t = text.trim();
  return /(鲁尔区|东北老工业|APS|MES|工业废墟|智能工厂|钢铁厂|造船厂)/.test(t);
}

export function isIslandGeekHackathonScript(text: string): boolean {
  const t = text.trim();
  return (
    /(巴厘岛|清迈|乌布)/.test(t) &&
    /(数字游民|数字游牧|游民社区)/.test(t) &&
    /(Agent|开源项目|Co-founder|大模型|全栈|极客)/i.test(t)
  );
}

export function isMountainDylRetreatScript(text: string): boolean {
  const t = text.trim();
  return (
    /(安吉.*DNA|阿那亚)/.test(t) &&
    /(DYL|设计你的人生|围炉煮茶|MBTI|人生转型|燃尽)/.test(t)
  );
}

/** @deprecated alias */
export const VIBE_SCRIPT_3_ID = 'dali_non_mainstream_collision';

export function isScript3NonMainstreamCollision(text: string): boolean {
  const t = text.trim();
  if (!/大理/.test(t)) return false;
  return /(游民|野生|手艺人|陶艺|悬浮|捡菌|苍山|集市|不是互联网|互联网圈|AI\s*System|数据符号|剥离逻辑|真实生活|流浪歌手|主理人|物理世界)/i.test(
    t,
  );
}

export const SCRIPT_3_SUPPRESSED_CHIP_IDS = new Set([
  'deep_relax',
  'cross_energy',
  'deep_learning',
  'music_bar',
  'music_vibe',
  'mindless_float',
  'co_creation',
  'credential_tier',
]);

export const SCRIPT_3_INDUSTRY_PREFERENCE = [
  '艺术/设计/策展',
  '独立品牌主理人',
  '自由职业',
  '知名制造集团',
];

export const SCRIPT_3_EXPECTED_CHIP_LABELS = [
  '🌾 大理变蕉游牧',
  '🍄 苍山捡菌子',
  '🍳 炊事合伙人',
  '🎨 剥离悬浮感',
] as const;

export const VIBE_RECRUITMENT_SCRIPTS: VibeRecruitmentScriptProfile[] = [
  {
    id: 'dopamine_escape',
    title: '黑夜逃跑 · 高纯度多巴胺',
    detect: isDopamineEscapeScript,
    suppressedChipIds: new Set([
      ...GENERIC_SUPPRESS,
      'credential_tier',
      'executive_circle',
      'vibe_coding',
      'co_creation',
    ]),
    coreChipIds: ['surf_skydive', 'beach_edm', 'blindbox_follow', 'burn_revival'],
    teamworkModel: 'Full-Service',
    buildHardGates: (text, inferBudgetRange) => ({
      budget_range: inferBudgetRange(text) ?? '预算无上限',
      education_baseline: 'None',
      industry_preference: ['艺术/设计/策展', '自由职业'],
      security_level: 'Standard',
    }),
    buildSlots: () => [
      slot(
        1,
        'ESFP · 满血复活的顶级快乐宿主',
        '毫无班味的快乐制造机，无缝带飞高压燃尽后的高管',
        ['ESFP', 'ESTP'],
      ),
      slot(
        2,
        'ENFP · 浪漫至死的野生探险家',
        '极其擅长在海滩和公路片场景下，提供极高溢价的情绪价值',
        ['ENFP', 'ESFP'],
      ),
    ],
  },
  {
    id: 'polar_expedition',
    title: '极圈科考 · 冰川极昼',
    detect: isPolarExpeditionScript,
    suppressedChipIds: new Set([...GENERIC_SUPPRESS, 'luxury_tier', 'cooking_partner']),
    coreChipIds: ['polar_expedition', 'extreme_trek', 'dem_survey', 'extreme_cold_survival'],
    teamworkModel: 'Co-Creation',
    buildHardGates: (_text, inferBudgetRange) => ({
      budget_range: inferBudgetRange(_text),
      education_baseline: 'Master',
      industry_preference: ['泛科技/互联网', '金融/咨询'],
      security_level: 'High',
    }),
    buildSlots: () => [
      slot(
        1,
        'INTJ · 极冷酷的危机决策大脑',
        '极端失温环境下，提供 System 2 的纯理性生存决策',
        ['INTJ', 'ISTJ'],
      ),
      slot(
        2,
        'INFP/INFJ · 敬畏自然的精神共鸣者',
        '在长达数日的白色荒原中，提供高带宽的高级精神支撑',
        ['INFP', 'INFJ'],
      ),
    ],
  },
  {
    id: 'iceland_laugavegur_heavy_trek',
    title: '冰岛兰格维格 · 内陆重装与 DEM 盲导',
    detect: isIcelandLaugavegurHeavyTrekScript,
    sceneCategory: PREMIUM_TREKKING_SCENE_ID,
    suppressedChipIds: new Set([
      ...GENERIC_SUPPRESS,
      'polar_expedition',
      'chuanxi_heavy_trek',
      'dem_survey',
      'extreme_trek',
      'deep_relax',
      'dyl_life_design',
      'cooking_partner',
    ]),
    coreChipIds: [
      'laugavegur_55km',
      'iceland_volcanic_wilderness',
      'dem_blind_nav',
      'glacier_river_ford',
    ],
    teamworkModel: 'Co-Creation',
    buildHardGates: (text, inferBudgetRange) => ({
      budget_range: inferBudgetRange(text) ?? '¥15000-30000 / 人',
      education_baseline: 'Master',
      industry_preference: ['泛科技/互联网', '知名制造集团'],
      security_level: 'High',
    }),
    buildSlots: () => [
      slot(
        1,
        'ISTP · 冰岛越野机械师 / 物理输出极值',
        '动手能力极强，面对高寒帐篷结冰、扣具损耗或涉水失稳，提供最令人安心的物理救援与执行力',
        ['ISTP', 'ESTP'],
      ),
      slot(
        2,
        'INTJ · 极冷酷的离线气象精算师',
        '同样具备硬核数据洁癖，在内陆突发狂风暴雪时能跟队长在同一认知带宽内冷酷推演天气熔断点，坚决执行 Plan B',
        ['INTJ', 'ISTJ'],
      ),
    ],
  },
  {
    id: 'chuanxi_heavy_trek',
    title: '川西重装 · 离线高程与冷酷行军',
    detect: isChuanxiHeavyTrekScript,
    sceneCategory: PREMIUM_TREKKING_SCENE_ID,
    suppressedChipIds: new Set([
      ...GENERIC_SUPPRESS,
      'polar_expedition',
      'dem_survey',
      'extreme_trek',
      'deep_relax',
      'dyl_life_design',
      'cooking_partner',
    ]),
    coreChipIds: ['chuanxi_heavy_trek', 'dem_digital_elevation', 'self_supported_camping', 'risk_self_managed'],
    teamworkModel: 'Co-Creation',
    buildHardGates: (text, inferBudgetRange) => ({
      budget_range: inferBudgetRange(text) ?? '¥2000-5000 / 人',
      education_baseline: 'Master',
      industry_preference: ['泛科技/互联网', '知名制造集团'],
      security_level: 'High',
    }),
    buildSlots: () => [
      slot(
        1,
        'ISTP · 荒野物理输出机/应急专家',
        '动手能力极强，擅长极端环境下的扎营、绳索操作与物理救援',
        ['ISTP', 'ESTP'],
      ),
      slot(
        2,
        'INTJ · 极冷酷的离线路线精算师',
        '数据洁癖，用 System 2 逻辑严格卡死行军配速与天气熔断点',
        ['INTJ', 'ISTJ'],
      ),
    ],
  },
  {
    id: 'light_trek_dyl_retreat',
    title: '轻装隐居 · 乌孙/雨崩人生设计局',
    detect: isLightTrekDylRetreatScript,
    sceneCategory: PREMIUM_TREKKING_SCENE_ID,
    suppressedChipIds: new Set([
      ...GENERIC_SUPPRESS,
      'chuanxi_heavy_trek',
      'anji_dna',
      'valley_bonfire',
      'vibe_coding',
      'extreme_adventure',
    ]),
    coreChipIds: ['yubeng_light_retreat', 'dyl_life_design', 'burnwash_full', 'starry_bonfire'],
    teamworkModel: 'Co-Creation',
    buildHardGates: (_text, inferBudgetRange) => ({
      budget_range: inferBudgetRange(_text) ?? '经济弹性',
      education_baseline: 'Master',
      industry_preference: ['泛科技/互联网', '金融/咨询'],
      security_level: 'High',
    }),
    buildSlots: () => [
      slot(
        1,
        'INFJ · 极具同理心的精神摆渡人',
        '天然的心理树洞，擅长在雪山围炉场景下提供最高质量的认知带宽',
        ['INFJ', 'INFP'],
      ),
      slot(
        2,
        'ENFP · 快乐无解的旷野破冰者',
        '用野生、流动的生命力，一瞬间把你从虚无的大厂 PPT 叙事中拽回地球',
        ['ENFP', 'ESFP'],
      ),
    ],
  },
  {
    id: 'weekend_fast_light_trek',
    title: '山野速攀 · 止于呼吸的轻量化独行',
    detect: isWeekendFastLightTrekScript,
    sceneCategory: PREMIUM_TREKKING_SCENE_ID,
    suppressedChipIds: new Set([
      ...GENERIC_SUPPRESS,
      'deep_relax',
      'dyl_life_design',
      'music_bar',
      'cross_energy',
      'co_creation',
    ]),
    coreChipIds: ['trail_fast_ascent', 'hr_max_out', 'elite_silence', 'basecamp_craft_beer'],
    teamworkModel: 'Improvisational',
    buildHardGates: (_text, inferBudgetRange) => ({
      budget_range: inferBudgetRange(_text) ?? '经济弹性',
      education_baseline: 'Bachelor',
      industry_preference: ['泛科技/互联网'],
      security_level: 'Medium',
    }),
    buildSlots: () => [
      slot(
        1,
        'ISTJ · 极其自律的配速机器',
        '毫无情绪波动，用稳定的配速在前方破风，提供最令人安心的物理边界感',
        ['ISTJ', 'INTJ'],
      ),
      slot(
        2,
        'INTP · 拒绝高能耗社交的离线极客',
        '白天用身体的自虐击碎内耗，下山后能用最冷门、最硬核的黑话跟你干杯精酿',
        ['INTP', 'ISTP'],
      ),
    ],
  },
  {
    id: 'industrial_ruins',
    title: '工业探秘 · 重工业数字化溯源',
    detect: isIndustrialRuinsScript,
    suppressedChipIds: new Set([...GENERIC_SUPPRESS, 'extreme_adventure']),
    coreChipIds: ['industrial_ruins', 'aps_mes', 'steel_behemoth', 'ruins_trace'],
    teamworkModel: 'Co-Creation',
    buildHardGates: (_text, inferBudgetRange) => ({
      budget_range: inferBudgetRange(_text),
      education_baseline: 'Bachelor',
      industry_preference: ['知名制造集团', '泛科技/互联网'],
      security_level: 'High',
    }),
    buildSlots: () => [
      slot(
        1,
        'INTP · 赛博朋克重度发烧友',
        '为冰冷的重工业遗迹，注入赛博朋克美学与硬核历史解说',
        ['INTP', 'INTJ'],
      ),
      slot(
        2,
        'ESTP · 行动派供应链老炮',
        '拥有极强的现实穿透力，能搞定去保密老厂房和废墟的门禁通行',
        ['ESTP', 'ISTP'],
      ),
    ],
  },
  {
    id: 'island_geek_hackathon',
    title: '海岛极客 · 海滩黑客松',
    detect: isIslandGeekHackathonScript,
    suppressedChipIds: new Set([...GENERIC_SUPPRESS, 'deep_relax', 'wild_camping']),
    coreChipIds: ['bali_nomad', 'indie_hacking', 'coastal_rush', 'cofounder_blindbox'],
    teamworkModel: 'Improvisational',
    buildHardGates: (_text, inferBudgetRange) => ({
      budget_range: inferBudgetRange(_text) ?? '费用自理',
      education_baseline: 'Master',
      industry_preference: ['泛科技/互联网'],
      security_level: 'High',
    }),
    buildSlots: () => [
      slot(
        1,
        'INTP · 离线的全栈架构大拿',
        '提供顶配的底层系统架构认知，不废话，白天高效输出，晚间黑话对齐',
        ['INTP', 'INTJ'],
      ),
      slot(
        2,
        'ENFJ · 极具商业敏感度的出海搞钱玩家',
        '打破技术内耗，用极致的商业穿透力帮你把独立项目快速商业化落地',
        ['ENFJ', 'ENTJ'],
      ),
    ],
  },
  {
    id: 'mountain_dyl_retreat',
    title: '山野隐居 · Stanford 人生设计局',
    detect: isMountainDylRetreatScript,
    suppressedChipIds: new Set([...GENERIC_SUPPRESS, 'vibe_coding', 'extreme_adventure']),
    coreChipIds: ['anji_dna', 'dyl_life_design', 'valley_bonfire', 'burnwash'],
    teamworkModel: 'Co-Creation',
    buildHardGates: (_text, inferBudgetRange) => ({
      budget_range: inferBudgetRange(_text) ?? '经济弹性',
      education_baseline: 'Master',
      industry_preference: ['泛科技/互联网', '金融/咨询'],
      security_level: 'High',
    }),
    buildSlots: () => [
      slot(
        1,
        'INFJ · 极具神性的精神摆渡人',
        '天然的心理树洞，擅长在山谷围炉场景下提供最高质量的无损倾听与认知带宽',
        ['INFJ', 'INFP'],
      ),
      slot(
        2,
        'ENFP · 快乐无解的旷野破冰者',
        '用野生、流动的生命力，一把将你从悬浮的大厂叙事和内耗中拽回真实世界',
        ['ENFP', 'ESFP'],
      ),
    ],
  },
  {
    id: 'dali_non_mainstream_collision',
    title: '非主流对撞 · 大理野性手艺',
    detect: isScript3NonMainstreamCollision,
    suppressedChipIds: SCRIPT_3_SUPPRESSED_CHIP_IDS,
    coreChipIds: ['dali_nomad', 'cangshan_mushroom', 'detach_floating', 'cooking_partner'],
    teamworkModel: 'Improvisational',
    buildHardGates: (_text, inferBudgetRange) => ({
      budget_range: inferBudgetRange(_text) ?? '经济弹性',
      education_baseline: 'None',
      industry_preference: [...SCRIPT_3_INDUSTRY_PREFERENCE],
      security_level: 'Medium',
    }),
    buildSlots: () => [
      slot(
        1,
        'ISFP · 沉浸于物质世界的陶艺/手艺人',
        '完全没有大厂班味，用泥土、木头、香料等最具体的物理感官，带你击碎符号悬浮',
        ['ISFP', 'INFP'],
      ),
      slot(
        2,
        'ESTP · 野性难驯的荒野求生老炮',
        '物理执行力拉满，能带你爬最野的苍山、找最地道的苍蝇馆子，能量值满格',
        ['ESTP', 'ESFP'],
      ),
    ],
  },
];

export function resolveRecruitmentScript(text: string): VibeRecruitmentScriptProfile | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return VIBE_RECRUITMENT_SCRIPTS.find((s) => s.detect(trimmed)) ?? null;
}
