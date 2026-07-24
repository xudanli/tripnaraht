import {
  deriveRecruitmentFormSuggestions,
  parseVibeFreeTextWithRules,
  resolveVibeTeamworkContractModelLabel,
} from './vibe-llm-parse.engine';
import {
  PREMIUM_TREKKING_SCENE_ID,
  isPremiumTrekkingScriptId,
} from '../config/premium-trekking.config';
import { resolveRecruitmentScript } from '../config/vibe-recruitment-scripts.config';

const PREMIUM_TREK_DATASET = [
  {
    id: 'iceland_laugavegur_heavy_trek' as const,
    text:
      '2026年盛夏，打算去冰岛内陆搞一次经典的兰格维格（Laugavegur）55公里重装徒步。我们要用 3 到 4 天时间，从兰曼纳劳卡（Landmannalaugar）的彩色火山，一路穿过黑色曜石荒原和冰川河流，最终走到索斯莫克（Þórsmörk）的绿洲。一路上内陆天气变幻莫测，可能会遭遇极端暴风雪和强涉水路段，部分无人区完全断网。我已经把冰岛全岛的最新的 12.5米精度的 DEM 数字高程数据和离线 3D 路线包导入 TripNARA 了。希望搭子也是泛科技圈或者知名实业背景的高知白领，有硬核户外经验，数据洁癖，能严格遵守 LNT 无痕山林法则。一路上保持高阶的边界感，遇到突发失温风险能冷静执行 Plan B，别掉链子。',
    expectedChipLabels: ['🏔️ 兰格维格55km', '🌋 彩色火山与荒原', '📡 DEM高程盲导', '🌊 冰川强涉水'],
    teamworkModel: 'Co-Creation',
    teamworkLabel: '一起策划',
    slotTags: ['ISTP', 'INTJ'],
    educationBaseline: 'Master',
    budgetRange: '¥15000-30000 / 人',
    destinationSubScopeId: 'iceland',
    tripMoodTag: 'adventure',
  },
  {
    id: 'chuanxi_heavy_trek' as const,
    text:
      '6月下旬端午前后，打算去川西长坪沟穿毕棚沟，或者搞次贡嘎大环线重装徒步。不搞那种有马帮全包的保姆团，全程自己背负、扎营。路上可能会遇到高反、失温、极端暴风雪，对体能和意志力要求极高。我已经把这一路的 DEM 数字高程模型和多源卫星路径图全部导入设备了，有详细的 Plan B。搭子要理工科、泛科技圈的硬核户外老炮，懂得户外无痕山林（LNT）法则，遇到危险能冷静执行数据决策。最好是 QS50 硕士或者大厂专家，信用必须极佳，别在雪山上掉链子。',
    expectedChipLabels: ['🏔️ 川西重装徒步', '📡 DEM数字高程', '⛺️ 自负重野营', '🛡️ 风险自理'],
    teamworkModel: 'Co-Creation',
    teamworkLabel: '一起策划',
    slotTags: ['ISTP', 'INTJ'],
    educationBaseline: 'Master',
    budgetRange: '¥2000-5000 / 人',
    destinationSubScopeId: 'chuanxi',
    tripMoodTag: 'adventure',
  },
  {
    id: 'light_trek_dyl_retreat' as const,
    text:
      '大厂刚 Feature Freeze，整个人被精神内耗空了，满身班味。6月中下旬想去新疆乌孙古道或者川西雨崩搞次轻装徒步（马帮驼装备，人轻装走）。不想赶路，白天就在天堂湖边或者雪山脚下发呆、看流云，晚上在客栈里组个局。我想带一套 Stanford 的 DYL（设计人生）画布框架，大家就着星空，帮彼此做一次下半年的职场转型或创业复盘。搭子要大厂高管、产品总监或者金融圈投资人，学历要高。需要你具备极高的倾听带宽，拒绝爹味说教和无效的职场八卦，让我们在旷野里互相疗愈。',
    expectedChipLabels: ['🪵 雨崩轻装隐居', '📐 DYL人生设计', '🧘 班味全面净化', '🌌 星空围炉局'],
    teamworkModel: 'Co-Creation',
    teamworkLabel: '一起策划',
    slotTags: ['INFJ', 'ENFP'],
    educationBaseline: 'Master',
    destinationSubScopeId: 'xinjiang',
    tripMoodTag: 'healing',
  },
  {
    id: 'weekend_fast_light_trek' as const,
    text:
      '6月找个周末，想去杭州周边的百公里越野线（如浙西三尖、或者法喜寺-十里琅珰速攀）。不搞无效社交，不聊大厂八卦，也不用互相拍照。就是纯粹的极致轻量化（Fast & Light）速攀，把心率拉到 160，用物理痛苦去清洗脑子里的代码和融资焦虑。白天专注呼吸和脚下，下山之后在山脚小酒馆喝杯精酿原地解散。搭子要自律、体能过硬、同样高压工作的白领极客，一路上保持高阶的边界感与默契的沉默。',
    expectedChipLabels: ['🏃 山野速攀', '⚡️ 心率拉满', '🤐 高阶沉默', '🍺 下山精酿'],
    teamworkModel: 'Improvisational',
    teamworkLabel: '一起随便玩',
    slotTags: ['ISTJ', 'INTP'],
    educationBaseline: 'Bachelor',
    destinationSubScopeId: 'hangzhou_trails',
    tripMoodTag: 'adventure',
  },
] as const;

describe('Premium Trekking — 徒步场景 Gold Dataset', () => {
  it.each(PREMIUM_TREK_DATASET)('$id links to premium_trekking scene', ({
    id,
    text,
    expectedChipLabels,
    teamworkModel,
    teamworkLabel,
    slotTags,
    educationBaseline,
    budgetRange,
    destinationSubScopeId,
    tripMoodTag,
  }) => {
    const script = resolveRecruitmentScript(text);
    expect(script?.id).toBe(id);
    expect(isPremiumTrekkingScriptId(id)).toBe(true);

    const payload = parseVibeFreeTextWithRules(text);

    expect(payload.recruitment_script_id).toBe(id);
    expect(payload.recruitment_scene_category).toBe(PREMIUM_TREKKING_SCENE_ID);

    for (const label of expectedChipLabels) {
      expect(payload.vibe_chips.map((c) => c.label)).toContain(label);
    }
    expect(payload.teamwork_contract_model).toBe(teamworkModel);
    expect(resolveVibeTeamworkContractModelLabel(payload.teamwork_contract_model)).toBe(
      teamworkLabel,
    );
    expect(payload.hard_gates.education_baseline).toBe(educationBaseline);
    if (budgetRange) {
      expect(payload.hard_gates.budget_range).toBe(budgetRange);
    }
    expect(payload.slot_definitions[0].expected_tag).toContain(slotTags[0]);
    expect(payload.slot_definitions[1].expected_tag).toContain(slotTags[1]);

    const suggestions = deriveRecruitmentFormSuggestions(
      text,
      payload.vibe_chips,
      payload.hard_gates,
    );
    expect(suggestions.recruitmentScriptId).toBe(id);
    expect(suggestions.recruitmentSceneCategory).toBe(PREMIUM_TREKKING_SCENE_ID);
    expect(suggestions.destinationSubScopeId).toBe(destinationSubScopeId);
    expect(suggestions.tripMoodTag).toBe(tripMoodTag);
  });
});
