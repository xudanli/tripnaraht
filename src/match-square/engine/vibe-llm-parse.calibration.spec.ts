import {
  calibrateLlmPayloadWithRules,
  parseVibeFreeTextWithRules,
  buildVibeLlmParseViewFromPayload,
} from './vibe-llm-parse.engine';
import type { VibeLlmParsePayload } from '../types/vibe-llm.types';

const ISLAND_TEXT =
  '打算去巴厘岛乌布数字游牧三个月，白天写 Agent 开源项目，晚上海滩狂飙，费用自理，Co-founder 原地组队。';

const LAUGAVEGUR_TEXT =
  '2026年盛夏，打算去冰岛内陆搞一次经典的兰格维格（Laugavegur）55公里重装徒步。我们要用 3 到 4 天时间，从兰曼纳劳卡（Landmannalaugar）的彩色火山，一路穿过黑色曜石荒原和冰川河流，最终走到索斯莫克（Þórsmörk）的绿洲。一路上内陆天气变幻莫测，可能会遭遇极端暴风雪和强涉水路段，部分无人区完全断网。我已经把冰岛全岛的最新的 12.5米精度的 DEM 数字高程数据和离线 3D 路线包导入 TripNARA 了。希望搭子也是泛科技圈或者知名实业背景的高知白领，有硬核户外经验，数据洁癖，能严格遵守 LNT 无痕山林法则。一路上保持高阶的边界感，遇到突发失温风险能冷静执行 Plan B，别掉链子。';

describe('calibrateLlmPayloadWithRules', () => {
  it('fills empty LLM chips and generic slots from rules', () => {
    const rules = parseVibeFreeTextWithRules(ISLAND_TEXT);
    const weakLlm: VibeLlmParsePayload = {
      vibe_chips: [],
      teamwork_contract_model: 'Co-Creation',
      hard_gates: { budget_range: null, education_baseline: 'None', industry_preference: [], security_level: 'Standard' },
      slot_definitions: [
        {
          slot_id: 1,
          expected_tag: '满血复活的社交气氛组',
          reason: 'AI: 动态拼图补位',
        },
      ],
      behavioral_contracts: [],
      contract_hint: null,
      parse_source: 'llm',
      parse_version: 'vibe_llm_v2',
    };

    const calibrated = calibrateLlmPayloadWithRules(ISLAND_TEXT, weakLlm);

    expect(calibrated.parse_source).toBe('llm');
    expect(calibrated.vibe_chips.length).toBeGreaterThan(0);
    expect(calibrated.vibe_chips.map((c) => c.label)).toContain('🌴 巴厘岛游牧');
    expect(calibrated.teamwork_contract_model).toBe('Improvisational');
    expect(calibrated.hard_gates.education_baseline).toBe(rules.hard_gates.education_baseline);
    expect(calibrated.slot_definitions[0].expected_tag).toContain('INTP');
  });

  it('keeps LLM derived fields while tightening hard gates from rules', () => {
    const weakLlm: VibeLlmParsePayload = {
      vibe_chips: [{ id: 'bali_nomad', label: '🌴 巴厘岛游牧' }],
      teamwork_contract_model: 'Improvisational',
      hard_gates: {
        budget_range: null,
        education_baseline: 'None',
        industry_preference: [],
        security_level: 'Standard',
      },
      slot_definitions: parseVibeFreeTextWithRules(ISLAND_TEXT).slot_definitions,
      behavioral_contracts: [],
      contract_hint: null,
      derived_fields: {
        itinerary_summary: 'LLM 生成的行程概述',
        captain_message: 'LLM 生成的队长寄语',
      },
      parse_source: 'llm',
      parse_version: 'vibe_llm_v2',
    };

    const calibrated = calibrateLlmPayloadWithRules(ISLAND_TEXT, weakLlm);

    expect(calibrated.derived_fields?.itinerary_summary).toBe('LLM 生成的行程概述');
    expect(calibrated.hard_gates.budget_range).toBe('费用自理');
    expect(calibrated.hard_gates.education_baseline).toBe('Master');
  });

  it('overrides LLM 川西 mis-tag when rules resolve iceland laugavegur script', () => {
    const wrongLlm: VibeLlmParsePayload = {
      vibe_chips: [
        { id: 'chuanxi_heavy_trek', label: '🏔️ 川西重装徒步' },
        { id: 'dem_digital_elevation', label: '📡 DEM数字高程' },
        { id: 'self_supported_camping', label: '⛺️ 自负重野营' },
        { id: 'risk_self_managed', label: '🛡️ 风险自理' },
        { id: 'elite_silence', label: '🤐 高阶沉默' },
      ],
      teamwork_contract_model: 'Co-Creation',
      hard_gates: {
        budget_range: '¥2000-10000 / 人',
        education_baseline: 'Master',
        industry_preference: ['泛科技/互联网'],
        security_level: 'High',
      },
      slot_definitions: [
        {
          slot_id: 1,
          expected_tag: 'ISTP · 荒野物理输出机/应急专家',
          reason: 'AI: 川西重装物理救援',
        },
        {
          slot_id: 2,
          expected_tag: 'INTJ · 极冷酷的离线路线精算师',
          reason: 'AI: 川西 DEM 配速',
        },
      ],
      behavioral_contracts: [],
      contract_hint: null,
      derived_fields: {
        itinerary_summary: '端午前后川西重装穿线，自负重扎营，离线 DEM 与 Plan B 并行。',
        captain_message: '希望理工科硬核户外老炮，LNT 法则，数据决策。',
      },
      parse_source: 'llm',
      parse_version: 'vibe_llm_v2',
      recruitment_script_id: 'chuanxi_heavy_trek',
    };

    const calibrated = calibrateLlmPayloadWithRules(LAUGAVEGUR_TEXT, wrongLlm);
    const view = buildVibeLlmParseViewFromPayload(calibrated);

    expect(calibrated.recruitment_script_id).toBe('iceland_laugavegur_heavy_trek');
    expect(calibrated.vibe_chips.map((c) => c.label)).toEqual([
      '🏔️ 兰格维格55km',
      '🌋 彩色火山与荒原',
      '📡 DEM高程盲导',
      '🌊 冰川强涉水',
    ]);
    expect(calibrated.vibe_chips.map((c) => c.label)).not.toContain('🏔️ 川西重装徒步');
    expect(calibrated.slot_definitions[0].expected_tag).toContain('冰岛越野机械师');
    expect(view.trekkingOrchestration?.scriptId).toBe('iceland_laugavegur_heavy_trek');
    expect(
      view.trekkingOrchestration?.worldModel.routeDirectionCandidates.some(
        (r) => r.routeDirectionName === 'IS_LAUGAVEGUR' && r.availability === 'live',
      ),
    ).toBe(true);
    expect(
      view.trekkingOrchestration?.worldModel.routeDirectionCandidates.some((r) =>
        /长坪沟|贡嘎/.test(r.labelZh),
      ),
    ).toBe(false);
  });
});
