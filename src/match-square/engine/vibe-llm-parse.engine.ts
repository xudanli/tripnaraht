import { VIBE_TAG_LEXICON } from '../config/vibe-tag-lexicon.config';
import {
  BEHAVIORAL_CONTRACT_DICTIONARY,
  TEAMWORK_CONTRACT_HINTS,
} from '../config/behavioral-contract-dictionary.config';
import { VIBE_LLM_PARSE_VERSION } from '../config/vibe-llm-system-prompt.config';
import { resolveTeamworkStyleLabel } from '../config/planning-styles.config';
import type {
  VibeBehavioralContract,
  VibeChip,
  VibeDerivedRecruitmentFields,
  VibeHardGates,
  VibeLlmParsePayload,
  VibeLlmParseView,
  VibeRecruitmentFormSuggestions,
  VibeSecurityLevel,
  VibeSlotDefinition,
  VibeTeamworkContractModel,
} from '../types/vibe-llm.types';
import { VIBE_LLM_SNAPSHOT_KEY, VIBE_PARSE_SNAPSHOT_KEY } from '../types/vibe-llm.types';
import type { TravelMode, TripMoodTag } from '../types/match-square.types';
import { resolveRecruitmentScript } from '../config/vibe-recruitment-scripts.config';
import { isPremiumTrekkingScriptId } from '../config/premium-trekking.config';
import { inferDestinationTaxonomy } from '../config/destination-taxonomy.config';
import { buildTrekkingVibeOrchestrationPlan } from './trekking-vibe-orchestration.engine';
import { buildRouteTemplateIntentMatchPlan } from './route-template-intent.engine';

const MAX_DERIVED_FIELD_LEN = 500;

const INDUSTRY_PREFERENCE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /大厂|互联网|泛科技|科技|AI|产品总监|Feature Freeze|班味/, label: '泛科技/互联网' },
  { pattern: /金融|咨询|战投|战略/, label: '金融/咨询' },
  { pattern: /制造|实业|供应链|Deli|Guangbo|广博文具/, label: '知名制造集团' },
  { pattern: /策展|设计|艺术|插画|自由职业|独立品牌/, label: '艺术/设计/策展' },
  { pattern: /民谣|酒馆|咖啡馆/, label: '独立品牌主理人' },
];

const TEAMWORK_MODEL_ALIASES: Record<string, VibeTeamworkContractModel> = {
  'Full-Service': 'Full-Service',
  'Co-Creation': 'Co-Creation',
  Improvisational: 'Improvisational',
  全托管: 'Full-Service',
  一起策划: 'Co-Creation',
  一起随便玩: 'Improvisational',
};

const TEAMWORK_MODEL_LABELS: Record<VibeTeamworkContractModel, string> = {
  'Full-Service': '全托管',
  'Co-Creation': '一起策划',
  Improvisational: '一起随便玩',
};

export function normalizeTeamworkContractModel(raw: string | undefined | null): VibeTeamworkContractModel {
  const key = String(raw ?? '').trim();
  return TEAMWORK_MODEL_ALIASES[key] ?? 'Co-Creation';
}

/** Vibe 解析/卡片展示 — 组队风格中文胶囊文案（与 planningStyleLabel 对齐） */
export function resolveVibeTeamworkContractModelLabel(
  model: VibeTeamworkContractModel | string | null | undefined,
): string {
  const normalized = normalizeTeamworkContractModel(model);
  return TEAMWORK_MODEL_LABELS[normalized];
}

export function normalizeSecurityLevel(raw: string | undefined | null): VibeSecurityLevel {
  const key = String(raw ?? '').trim();
  if (key === 'High' || key === '高') return 'High';
  if (key === 'Medium' || key === '中') return 'Medium';
  return 'Standard';
}

export function formatVibeSlotReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) return 'AI: 动态拼图补位';
  if (/^AI[：:]/i.test(trimmed)) return trimmed.replace(/^AI[：:]/i, 'AI: ');
  return `AI: ${trimmed}`;
}

function inferCaptainFullPaySuffix(text: string): string {
  if (
    /(?:路线|预约|费用|预算|住宿).*全包|我(?:来)?全包|全包(?:行程|路线|预约|费用|预算)|已经.*订好/.test(
      text,
    )
  ) {
    return ' · 队长全包';
  }
  return '';
}

function inferBudgetRange(text: string): string | null {
  if (/预算无上限|我甚至可以全包/.test(text)) return '预算无上限';
  if (/费用自理/.test(text)) return '费用自理';
  if (/经济弹性|预算随意|不限预算|弹性消费/.test(text)) return '经济弹性';

  const fullPaySuffix = inferCaptainFullPaySuffix(text);

  const wanUp = text.match(/(?:人均\s*)?(?:预算\s*)?(\d+)\s*[wW万]\s*(?:往上|以上|起|\+|＋)/);
  if (wanUp) {
    return `¥${Number(wanUp[1]) * 10000}+ / 人${fullPaySuffix}`;
  }

  if (/预算全包|费用全包|我(?:来)?全包(?:费用|预算)?/.test(text)) {
    return '预算全包';
  }

  const cnRange = text.match(/预算\s*([两二2\d]+)\s*[到至\-~]\s*([三四五5\d]+)\s*千/);
  if (cnRange) {
    const low = cnRange[1].replace('两', '2').replace('二', '2');
    const high = cnRange[2].replace('五', '5').replace('三', '3').replace('四', '4');
    return `¥${Number(low) * 1000}-${Number(high) * 1000} / 人${fullPaySuffix}`;
  }
  const numRange = text.match(/(\d{3,5})\s*[到至\-~]\s*(\d{3,5})/);
  if (numRange) return `¥${numRange[1]}-${numRange[2]} / 人${fullPaySuffix}`;
  return null;
}

/** budget_range 文案 → 分（cents） */
export function parseBudgetRangeToCents(
  range: string | null | undefined,
): { budgetMinCents: number | null; budgetMaxCents: number | null } {
  if (!range || range === '经济弹性') {
    return { budgetMinCents: null, budgetMaxCents: null };
  }
  const plus = range.match(/¥(\d+)\+/);
  if (plus) {
    return { budgetMinCents: Number(plus[1]) * 100, budgetMaxCents: null };
  }
  const band = range.match(/¥(\d+)-(\d+)/);
  if (band) {
    return {
      budgetMinCents: Number(band[1]) * 100,
      budgetMaxCents: Number(band[2]) * 100,
    };
  }
  return { budgetMinCents: null, budgetMaxCents: null };
}

const DESTINATION_HINTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /西北环线|青甘环线|青甘大环/, label: '西北·青甘大环' },
  { pattern: /新西兰/, label: '新西兰' },
  { pattern: /新疆/, label: '新疆' },
  { pattern: /塞里木湖|赛里木湖/, label: '新疆' },
  { pattern: /大理/, label: '西南·大理丽江' },
  { pattern: /冰岛/, label: '冰岛' },
  { pattern: /川西/, label: '川西' },
  { pattern: /南疆|北疆/, label: '新疆' },
];

function inferDestinationFallback(text: string): string | null {
  for (const hint of DESTINATION_HINTS) {
    if (hint.pattern.test(text)) return hint.label;
  }
  const goMatch = text.match(/(?:打算|计划|想去|要去|去)([\u4e00-\u9fa5A-Za-z]{2,10}?)(?:搞|玩|游|边|滑雪|跳伞|线|露营|躺|待)/);
  if (goMatch?.[1]) return goMatch[1].trim();
  const orMatch = text.match(/(?:或者|或是)([\u4e00-\u9fa5A-Za-z]{2,8}?)(?:边|游|滑雪|跳伞)/);
  if (orMatch?.[1]) return orMatch[1].trim();
  return null;
}

function inferDestinationFields(text: string): Pick<
  VibeRecruitmentFormSuggestions,
  | 'destination'
  | 'destinationRegionId'
  | 'destinationRegionLabel'
  | 'destinationSubScopeId'
  | 'destinationSubScopeLabel'
> {
  const taxonomy = inferDestinationTaxonomy(text);
  if (taxonomy) {
    return {
      destination: taxonomy.destination,
      destinationRegionId: taxonomy.destinationRegionId,
      destinationRegionLabel: taxonomy.destinationRegionLabel,
      destinationSubScopeId: taxonomy.destinationSubScopeId,
      destinationSubScopeLabel: taxonomy.destinationSubScopeLabel,
    };
  }
  return {
    destination: inferDestinationFallback(text),
    destinationRegionId: null,
    destinationRegionLabel: null,
    destinationSubScopeId: null,
    destinationSubScopeLabel: null,
  };
}

function inferDepartureLabel(text: string): string | null {
  const match = text.match(/(?:从|自)([\u4e00-\u9fa5]{2,8})(?:出发|起飞|集合|开车)/);
  return match?.[1]?.trim() ?? null;
}

function inferTravelMode(text: string, chips: VibeChip[]): TravelMode | null {
  const selfDrive =
    /自驾|环.*国|公路旅行|开车环|直升机/.test(text) ||
    chips.some((c) => ['self_drive_tour', 'hardcore_offroad', 'extreme_adventure'].includes(c.id));
  const transit = /高铁|飞机|公共交通|公交|地铁|火车/.test(text);
  if (selfDrive && transit) return 'mixed';
  if (selfDrive) return 'self_drive';
  if (transit) return 'public_transit';
  return null;
}

function inferTripMoodTag(text: string, chips: VibeChip[]): TripMoodTag | null {
  if (
    /躺尸|疗愈|发呆|班味|强迫症|无脑放空|互相疗愈|DYL|设计人生/.test(text) ||
    chips.some((c) => ['deep_relax', 'mindless_float', 'burnwash', 'burnwash_full', 'dyl_life_design'].includes(c.id))
  ) {
    return 'healing';
  }
  if (
    /跳伞|极限|冒险|高强度|越野|adrenaline|重装|失温|速攀|心率/i.test(text) ||
    chips.some((c) =>
      [
        'extreme_adventure',
        'hardcore_offroad',
        'hardcore_survival',
        'chuanxi_heavy_trek',
        'iceland_laugavegur_heavy_trek',
        'laugavegur_55km',
        'dem_blind_nav',
        'glacier_river_ford',
        'trail_fast_ascent',
        'hr_max_out',
        'risk_self_managed',
      ].includes(c.id),
    )
  ) {
    return 'adventure';
  }
  if (/社交|组局|party|一起嗨/i.test(text) || chips.some((c) => c.id === 'music_vibe')) {
    return 'social';
  }
  if (/放松|松弛|慢节奏/.test(text)) return 'relax';
  return null;
}

function buildPreferenceNotes(hardGates: VibeHardGates): string | null {
  const parts: string[] = [];
  if (hardGates.industry_preference?.length) {
    parts.push(`圈层偏好：${hardGates.industry_preference.join('、')}`);
  }
  if (hardGates.education_baseline && hardGates.education_baseline !== 'None') {
    parts.push(`学历：${hardGates.education_baseline} 及以上`);
  }
  return parts.length > 0 ? parts.join('；') : null;
}

/** 发布表单其他字段 — 供 parse 响应与 createPost 缺省回填 */
export function deriveRecruitmentFormSuggestions(
  text: string,
  chips: VibeChip[],
  hardGates: VibeHardGates,
): VibeRecruitmentFormSuggestions {
  const script = resolveRecruitmentScript(text);
  const { budgetMinCents, budgetMaxCents } = parseBudgetRangeToCents(hardGates.budget_range);
  return {
    ...inferDestinationFields(text),
    departureLabel: inferDepartureLabel(text),
    budgetMinCents,
    budgetMaxCents,
    travelMode: inferTravelMode(text, chips),
    tripMoodTag: inferTripMoodTag(text, chips),
    preferenceNotes: buildPreferenceNotes(hardGates),
    recruitmentScriptId: script?.id ?? null,
    recruitmentSceneCategory: script?.sceneCategory ?? null,
  };
}

function slugify(label: string): string {
  return label.replace(/[^\w\u4e00-\u9fff]+/g, '_').slice(0, 40) || 'chip';
}

function extractChips(text: string): VibeChip[] {
  const chips: VibeChip[] = [];
  const seen = new Set<string>();
  const suppressed = new Set<string>();

  for (const rule of VIBE_TAG_LEXICON) {
    if (suppressed.has(rule.id)) continue;
    if (!rule.patterns.some((p) => p.test(text)) || seen.has(rule.chipLabel)) continue;

    seen.add(rule.chipLabel);
    for (const id of rule.suppresses ?? []) {
      suppressed.add(id);
    }
    chips.push({
      id: rule.id,
      label: rule.chipLabel,
      lexiconKey: rule.id,
    });
  }

  // 移除已被 suppress 但仍入队的泛化 chip
  let result = chips.filter((chip) => !suppressed.has(chip.id));

  const script = resolveRecruitmentScript(text);
  if (script) {
    result = result.filter((chip) => !script.suppressedChipIds.has(chip.id));
    const coreSet = new Set(script.coreChipIds);
    const core = script.coreChipIds
      .map((id) => result.find((c) => c.id === id))
      .filter((c): c is VibeChip => c != null);
    const extra = result.filter((c) => !coreSet.has(c.id)).slice(0, 1);
    result = [...core, ...extra].slice(0, 6);
  }

  return result;
}

function inferTeamworkModel(text: string, chips: VibeChip[]): VibeTeamworkContractModel {
  const script = resolveRecruitmentScript(text);
  if (script) return script.teamworkModel;
  if (/躺尸|疗愈|发呆|看云|随便玩|即兴|freestyle|随缘|各玩各|白天各忙|不赶任何景点|无脑放空|极度松弛/.test(text)) {
    return 'Improvisational';
  }
  if (
    /全托管|你闭眼跟|我来安排|队长负责|攻略.*都.*安排|服从指挥|不需要你?动脑子|别对路线指手画脚|都.*订好|托关系.*订/.test(
      text,
    )
  ) {
    return 'Full-Service';
  }
  if (chips.some((c) => c.id === 'captain_full_service')) return 'Full-Service';
  if (/一起策划|分工|合伙|共建|民主|做饭穷游组|商量/.test(text)) return 'Co-Creation';
  if (chips.some((c) => c.id === 'deep_relax')) return 'Improvisational';
  if (chips.some((c) => c.id === 'co_creation' || c.id === 'cooking_partner')) {
    return 'Co-Creation';
  }
  if (chips.some((c) => c.id === 'self_drive_tour') && chips.some((c) => c.id === 'wild_camping')) {
    return 'Co-Creation';
  }
  return 'Co-Creation';
}

function inferHardGates(text: string): VibeHardGates {
  const script = resolveRecruitmentScript(text);
  if (script) return script.buildHardGates(text, inferBudgetRange);

  const gates: VibeHardGates = {
    budget_range: inferBudgetRange(text),
    education_baseline: 'None',
    industry_preference: [],
    security_level: 'Standard',
  };

  if (/博士/.test(text)) gates.education_baseline = 'Doctor';
  else if (/硕士/.test(text)) gates.education_baseline = 'Master';
  else if (/本科|高学历|985|211|大厂|靠谱|不掉链子|理工科/.test(text)) {
    gates.education_baseline = 'Bachelor';
  }

  if (/靠谱|不掉链子|大厂|学历|授信|认证|芝麻分|芝麻信用|温室|极佳/.test(text)) {
    gates.security_level = 'High';
  } else if (/艺术|自由职业|疗愈|躺尸|经济弹性/.test(text)) {
    gates.security_level = 'Medium';
  }

  if (/艺术|自由职业|策展|插画|品牌主理/.test(text)) {
    if (!gates.industry_preference!.includes('艺术/设计/策展')) {
      gates.industry_preference!.push('艺术/设计/策展');
    }
    if (/自由职业|主理人/.test(text) && !gates.industry_preference!.includes('独立品牌主理人')) {
      gates.industry_preference!.push('独立品牌主理人');
    }
    if (/自由职业/.test(text) && !gates.industry_preference!.includes('自由职业')) {
      gates.industry_preference!.push('自由职业');
    }
  }

  if (/理工科|动手|STEM/i.test(text) && !gates.industry_preference!.includes('泛科技/互联网')) {
    gates.industry_preference!.push('泛科技/互联网');
  }

  for (const rule of INDUSTRY_PREFERENCE_PATTERNS) {
    if (rule.pattern.test(text) && !gates.industry_preference!.includes(rule.label)) {
      gates.industry_preference!.push(rule.label);
    }
  }

  if (gates.industry_preference!.length === 0 && gates.education_baseline !== 'None') {
    gates.industry_preference = ['泛科技/互联网', '知名制造集团', '金融/咨询'];
  }

  if (!gates.budget_range && /躺尸|疗愈|发呆|艺术|自由职业|班味/.test(text)) {
    gates.budget_range = '经济弹性';
  }

  return gates;
}

function mapTagToMbti(tag: string): string[] {
  if (/E人|气氛组|社交/.test(tag)) return ['ENFP', 'ESFP'];
  if (/老司机|换胎|驾驶|副手|理工科|动手/.test(tag)) return ['ISTP', 'ESTP'];
  if (/露营|极客|装备|生存|断网/.test(tag)) return ['ISTP', 'INTP'];
  if (/炊事|合伙/.test(tag)) return ['ISFJ', 'ESFP'];
  return [];
}

function isHardcoreOffroadContext(text: string, chips: VibeChip[]): boolean {
  return (
    /越野|无人区|陷车|爆胎|扳手|硬核.*自驾|真自驾越野/.test(text) ||
    chips.some((c) => c.id === 'hardcore_offroad')
  );
}

function isHardcoreSurvivalContext(text: string, chips: VibeChip[]): boolean {
  return (
    /野外生存|断网|没信号|艰苦|不搞精致|精致露营|温室/.test(text) ||
    chips.some((c) => c.id === 'hardcore_survival')
  );
}

function isHealingRelaxContext(text: string, chips: VibeChip[]): boolean {
  return (
    /躺尸|疗愈|发呆|看云|班味|强迫症|不赶任何景点|无脑放空/.test(text) ||
    chips.some((c) => ['deep_relax', 'mindless_float', 'music_bar'].includes(c.id))
  );
}

function buildSlotDefinitions(text: string, chips: VibeChip[]): VibeSlotDefinition[] {
  const slots: VibeSlotDefinition[] = [];
  let slotId = 1;
  const hardcoreOffroad = isHardcoreOffroadContext(text, chips);
  const hardcoreSurvival = isHardcoreSurvivalContext(text, chips);
  const healingRelax = isHealingRelaxContext(text, chips);
  const script = resolveRecruitmentScript(text);

  if (script) {
    return script.buildSlots().slice(0, 4);
  }

  if (healingRelax) {
    slots.push({
      slot_id: slotId++,
      expected_tag: 'ENFP / 人形种草机',
      reason: formatVibeSlotReason('注入高能量生命力，彻底打破大厂紧绷防御'),
      targetMbtiTypes: ['ENFP', 'ESFP'],
    });
    slots.push({
      slot_id: slotId++,
      expected_tag: 'ISFP / 捕捉光影的摄影师',
      reason: formatVibeSlotReason('拒绝低质量社交，用审美留存发呆高光'),
      targetMbtiTypes: ['ISFP', 'INFP'],
    });
    return slots.slice(0, 4);
  }

  if (hardcoreOffroad) {
    slots.push({
      slot_id: slotId++,
      expected_tag: '硬核老司机/换胎副手',
      reason: formatVibeSlotReason('无人区/越野路况下爆胎陷车需共担救援与换胎'),
      targetMbtiTypes: ['ISTP', 'ESTP'],
    });
  }

  if (/理工科|动手能力|扳手/.test(text) || chips.some((c) => c.id === 'stem_mechanic')) {
    slots.push({
      slot_id: slotId++,
      expected_tag: '理工科动手达人',
      reason: formatVibeSlotReason('极端环境下设备故障与 improvised repair 需要 STEM 背景'),
      targetMbtiTypes: ['ISTP', 'INTP'],
    });
  }

  if (
    !hardcoreOffroad &&
    (/自驾|环游|公路|长途/.test(text) || chips.some((c) => c.id === 'self_drive_tour'))
  ) {
    slots.push({
      slot_id: slotId++,
      expected_tag: 'E人/气氛组',
      reason: formatVibeSlotReason('平衡长途自驾的沉闷氛围'),
      targetMbtiTypes: ['ENFP', 'ESFP'],
    });
    slots.push({
      slot_id: slotId++,
      expected_tag: '硬核老司机/换胎副手',
      reason: formatVibeSlotReason('长途自驾复杂路况物理分担'),
      targetMbtiTypes: ['ISTP', 'ESTP'],
    });
  }

  if (
    !hardcoreSurvival &&
    (/露营|帐篷/.test(text) || chips.some((c) => c.id === 'wild_camping'))
  ) {
    slots.push({
      slot_id: slotId++,
      expected_tag: '自备露营装备的极客',
      reason: formatVibeSlotReason('分摊露营硬件冗余成本'),
      targetMbtiTypes: ['ISTP', 'INTP'],
    });
  }

  if (/做饭|炊事|穷游|精打细算/.test(text) || chips.some((c) => c.id === 'cooking_partner')) {
    slots.push({
      slot_id: slotId++,
      expected_tag: '炊事合伙人',
      reason: formatVibeSlotReason('行中餐饮采购与费用轧差共担'),
      targetMbtiTypes: ['ISFJ', 'ESFP'],
    });
  }

  if (hardcoreSurvival) {
    slots.push({
      slot_id: slotId++,
      expected_tag: '断网生存共识队友',
      reason: formatVibeSlotReason('断网/无信号条件下共担艰苦装备与应急决策'),
      targetMbtiTypes: ['ISTP', 'INTJ'],
    });
  }

  if (slots.length === 0) {
    slots.push({
      slot_id: 1,
      expected_tag: '满血复活的社交气氛组',
      reason: formatVibeSlotReason('根据自由文本推断的团队能量补位'),
      targetMbtiTypes: ['ENFP', 'ENTP'],
    });
  }

  if (
    /服从指挥|(?:行程|安排|带队|指挥).*全包|全包(?:行程|安排|带队|指挥)|都.*订好|闭眼跟/.test(text) ||
    chips.some((c) => c.id === 'captain_full_service')
  ) {
    const execSlot = {
      slot_id: slotId++,
      expected_tag: '同圈层高管/金融白领',
      reason: formatVibeSlotReason('高净值全托管行程需圈层对等、费用观一致'),
      targetMbtiTypes: ['ENTJ', 'ESTJ'],
    };
    if (!slots.some((s) => /高管|金融/.test(s.expected_tag))) {
      slots.unshift({ ...execSlot, slot_id: 1 });
      slots.forEach((s, i) => {
        s.slot_id = i + 1;
      });
    }
  }

  return slots.slice(0, 4);
}

function buildBehavioralContracts(chips: VibeChip[]): VibeBehavioralContract[] {
  const contracts: VibeBehavioralContract[] = [];
  const seenKeys = new Set<string>();
  for (const chip of chips) {
    const rule = VIBE_TAG_LEXICON.find((r) => r.id === chip.id || r.id === chip.lexiconKey);
    if (!rule?.contractKey || seenKeys.has(rule.contractKey)) continue;
    const template = BEHAVIORAL_CONTRACT_DICTIONARY[rule.contractKey];
    if (!template) continue;
    seenKeys.add(rule.contractKey);
    contracts.push({
      chipId: chip.id,
      title: template.title,
      clauses: template.clauses,
    });
  }
  return contracts;
}

/** 读帖/申请时补全行为契约 — 修复早期发帖未写入 behavioral_contracts 的快照 */
export function enrichVibePayloadForRead(payload: VibeLlmParsePayload): VibeLlmParsePayload {
  const rebuilt = buildBehavioralContracts(payload.vibe_chips);
  const behavioral_contracts =
    payload.behavioral_contracts.length > 0 ? payload.behavioral_contracts : rebuilt;
  return {
    ...payload,
    behavioral_contracts,
    contract_hint: buildContractHint(payload.teamwork_contract_model, behavioral_contracts),
  };
}

function buildContractHint(
  model: VibeTeamworkContractModel,
  contracts: VibeBehavioralContract[],
): string | null {
  const hints = [TEAMWORK_CONTRACT_HINTS[model]];
  const firstContract = contracts[0];
  if (firstContract) {
    const template = Object.values(BEHAVIORAL_CONTRACT_DICTIONARY).find(
      (t) => t.title === firstContract.title,
    );
    if (template?.hint) hints.push(template.hint);
  }
  return hints.filter(Boolean).join(' ');
}

export function mapTeamworkModelToPlanningStyle(
  model: VibeTeamworkContractModel,
): 'full_managed' | 'co_planning' | 'casual_play' {
  switch (model) {
    case 'Full-Service':
      return 'full_managed';
    case 'Improvisational':
      return 'casual_play';
    default:
      return 'co_planning';
  }
}

function clampDerivedField(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_DERIVED_FIELD_LEN) return trimmed;
  return `${trimmed.slice(0, MAX_DERIVED_FIELD_LEN - 1)}…`;
}

function splitVisionSentences(text: string): string[] {
  return text
    .split(/[。！？\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function scoreCaptainSentence(sentence: string): number {
  let score = 0;
  if (/希望|期待|寻找|招募|搭子|队友|伙伴|同行|加入/.test(sentence)) score += 3;
  if (/不要|别|必须|一定|最好|靠谱|芝麻|学历|大厂|背景|授信|温室/.test(sentence)) score += 2;
  if (/各位|大家|你|我们一起去|不见不散|一起来|不是.*而是/.test(sentence)) score += 2;
  if (/分工|契约|策划|合伙|民主/.test(sentence)) score += 1;
  return score;
}

function scoreItinerarySentence(sentence: string): number {
  let score = 0;
  if (/想去|计划|安排|路线|沿|环|自驾|越野|无人区|露营|做饭|穷游|断网|艰苦|生存|打卡|追|看|出发/.test(sentence)) {
    score += 2;
  }
  if (/攻略|租车|住宿|酒店|驾驶|行程|南岸|环线|瀑布|沙滩|冰川/.test(sentence)) score += 2;
  if (/路上|沿途|一路|晚上|白天|\d+月|\d+天/.test(sentence)) score += 1;
  return score;
}

function buildItineraryFallback(text: string, chips: VibeChip[]): string {
  const labels = chips
    .slice(0, 5)
    .map((c) => c.label.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, ''))
    .filter(Boolean);
  if (labels.length > 0) {
    return `行程主打 ${labels.join('、')}，具体路线与节奏见招募愿景原文。`;
  }
  return text.slice(0, MAX_DERIVED_FIELD_LEN);
}

function buildCaptainFallback(text: string, chips: VibeChip[]): string {
  const requirementSnippets = text.match(/(?:希望|期待|寻找|搭子|队友|必须|最好|不要)[^。！？\n]{4,80}/g);
  if (requirementSnippets?.length) {
    return requirementSnippets.slice(0, 3).join('。');
  }
  const labels = chips
    .slice(0, 3)
    .map((c) => c.label.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, ''))
    .filter(Boolean);
  if (labels.length > 0) {
    return `期待与「${labels.join('、')}」同频、能共担责任边界的小伙伴一起出发。`;
  }
  return '期待 vibe 同频的旅伴一起完成这次招募愿景里的玩法与分工。';
}

/** 从招募愿景拆分为行程概述 + 队长寄语（发布表单自动填充） */
export function extractRecruitmentFieldDrafts(
  freeText: string,
  chips: VibeChip[],
): VibeDerivedRecruitmentFields {
  const text = freeText.trim();
  if (!text) {
    return { itinerary_summary: '', captain_message: '' };
  }

  const sentences = splitVisionSentences(text);
  const itineraryParts: string[] = [];
  const captainParts: string[] = [];

  for (const sentence of sentences) {
    const captainScore = scoreCaptainSentence(sentence);
    const itineraryScore = scoreItinerarySentence(sentence);

    if (captainScore > itineraryScore && captainScore >= 2) {
      captainParts.push(sentence);
    } else if (itineraryScore >= captainScore && itineraryScore >= 1) {
      itineraryParts.push(sentence);
    } else if (captainScore > 0) {
      captainParts.push(sentence);
    } else {
      itineraryParts.push(sentence);
    }
  }

  let itinerary_summary = itineraryParts.join('。');
  let captain_message = captainParts.join('。');

  if (itinerary_summary && !itinerary_summary.endsWith('。')) {
    itinerary_summary += '。';
  }
  if (captain_message && !captain_message.endsWith('。')) {
    captain_message += '。';
  }

  if (!captain_message) {
    captain_message = buildCaptainFallback(text, chips);
  }
  if (!itinerary_summary) {
    itinerary_summary =
      sentences.slice(0, Math.max(1, Math.ceil(sentences.length / 2))).join('。') ||
      buildItineraryFallback(text, chips);
  }

  return {
    itinerary_summary: clampDerivedField(itinerary_summary),
    captain_message: clampDerivedField(captain_message),
  };
}

/** 规则引擎 — LLM 不可用或降级时的确定性解析（PRD 4.3） */
export function parseVibeFreeTextWithRules(freeText: string): VibeLlmParsePayload {
  const text = freeText.trim();
  const vibe_chips = extractChips(text);
  const teamwork_contract_model = inferTeamworkModel(text, vibe_chips);
  const hard_gates = inferHardGates(text);
  const slot_definitions = buildSlotDefinitions(text, vibe_chips);
  const behavioral_contracts = buildBehavioralContracts(vibe_chips);
  const derived_fields = extractRecruitmentFieldDrafts(text, vibe_chips);
  const script = resolveRecruitmentScript(text);

  return {
    vibe_chips,
    teamwork_contract_model,
    hard_gates,
    slot_definitions,
    behavioral_contracts,
    contract_hint: buildContractHint(teamwork_contract_model, behavioral_contracts),
    derived_fields,
    parse_source: 'rules',
    parse_version: VIBE_LLM_PARSE_VERSION,
    recruitment_script_id: script?.id ?? null,
    recruitment_scene_category: script?.sceneCategory ?? null,
  };
}

const EDUCATION_RANK: Record<NonNullable<VibeHardGates['education_baseline']>, number> = {
  None: 0,
  Bachelor: 1,
  Master: 2,
  Doctor: 3,
};

const SECURITY_RANK: Record<VibeSecurityLevel, number> = {
  Standard: 0,
  Medium: 1,
  High: 2,
};

function maxEducationBaseline(
  a: VibeHardGates['education_baseline'],
  b: VibeHardGates['education_baseline'],
): VibeHardGates['education_baseline'] {
  const left = a ?? 'None';
  const right = b ?? 'None';
  return EDUCATION_RANK[left] >= EDUCATION_RANK[right] ? left : right;
}

function maxSecurityLevel(a: VibeSecurityLevel, b: VibeSecurityLevel): VibeSecurityLevel {
  return SECURITY_RANK[a] >= SECURITY_RANK[b] ? a : b;
}

function isGenericVibeSlotDefinitions(slots: VibeSlotDefinition[]): boolean {
  if (slots.length === 0) return true;
  return slots.every((s) =>
    /满血复活的社交气氛组|动态拼图补位|旅伴拼图位|^E人\/气氛组$/.test(s.expected_tag),
  );
}

function slotsAlignWithRules(
  llmSlots: VibeSlotDefinition[],
  rulesSlots: VibeSlotDefinition[],
): boolean {
  if (rulesSlots.length === 0 || llmSlots.length === 0) return false;
  const anchor = rulesSlots[0].expected_tag.split('·')[0]?.trim() ?? rulesSlots[0].expected_tag;
  const needle = anchor.slice(0, Math.min(4, anchor.length));
  return llmSlots.some((s) => s.expected_tag.includes(needle));
}

function mergeIndustryPreferences(llm: string[], rules: string[], preferRules: boolean): string[] {
  const merged = preferRules ? [...rules, ...llm] : [...llm, ...rules];
  return [...new Set(merged.filter(Boolean))];
}

function mergeChipsWithRulesCalibration(
  llmChips: VibeChip[],
  rulesChips: VibeChip[],
  script: ReturnType<typeof resolveRecruitmentScript>,
): VibeChip[] {
  if (llmChips.length === 0) return rulesChips;
  if (!script) return llmChips;

  const rulesCore = script.coreChipIds
    .map((id) => rulesChips.find((c) => c.id === id))
    .filter((c): c is VibeChip => c != null);

  // Gold Dataset / Premium Trekking：规则引擎 chip 为权威，避免 LLM 把冰岛重装误套川西 few-shot
  if (rulesCore.length === script.coreChipIds.length) {
    return rulesCore.slice(0, 6);
  }

  const byId = new Map<string, VibeChip>();
  for (const chip of llmChips) byId.set(chip.id, chip);
  for (const chip of rulesChips) {
    if (script.coreChipIds.includes(chip.id)) byId.set(chip.id, chip);
  }

  const coreSet = new Set(script.coreChipIds);
  const core = script.coreChipIds
    .map((id) => byId.get(id))
    .filter((c): c is VibeChip => c != null);
  const extra = llmChips.filter((c) => !coreSet.has(c.id)).slice(0, 2);
  return [...core, ...extra].slice(0, 6);
}

function mergeHardGatesWithRulesCalibration(
  llm: VibeHardGates,
  rules: VibeHardGates,
  script: ReturnType<typeof resolveRecruitmentScript>,
): VibeHardGates {
  const llmBudget = llm.budget_range?.trim() ? llm.budget_range.trim() : null;
  const rulesBudget = rules.budget_range?.trim() ? rules.budget_range.trim() : null;

  return {
    budget_range: llmBudget ?? rulesBudget,
    education_baseline: maxEducationBaseline(
      llm.education_baseline ?? 'None',
      rules.education_baseline ?? 'None',
    ),
    industry_preference: mergeIndustryPreferences(
      llm.industry_preference ?? [],
      rules.industry_preference ?? [],
      Boolean(script),
    ),
    security_level: maxSecurityLevel(
      llm.security_level ?? 'Standard',
      rules.security_level ?? 'Standard',
    ),
  };
}

function pickDerivedFields(
  llm: VibeDerivedRecruitmentFields | undefined,
  rules: VibeDerivedRecruitmentFields | undefined,
  script: ReturnType<typeof resolveRecruitmentScript>,
  sourceText: string,
): VibeDerivedRecruitmentFields | undefined {
  const llmItinerary = llm?.itinerary_summary?.trim() ?? '';
  const llmCaptain = llm?.captain_message?.trim() ?? '';
  const rulesItinerary = rules?.itinerary_summary?.trim() ?? '';
  const rulesCaptain = rules?.captain_message?.trim() ?? '';

  const preferRulesDerived =
    script != null &&
    isPremiumTrekkingScriptId(script.id) &&
    llmItinerary.length > 0 &&
    derivedFieldsConflictWithScript(script.id, sourceText, llmItinerary, llmCaptain);

  const itinerary = preferRulesDerived
    ? rulesItinerary || llmItinerary
    : llmItinerary || rulesItinerary;
  const captain = preferRulesDerived
    ? rulesCaptain || llmCaptain
    : llmCaptain || rulesCaptain;

  if (!itinerary && !captain) return undefined;
  return {
    itinerary_summary: itinerary,
    captain_message: captain,
  };
}

function derivedFieldsConflictWithScript(
  scriptId: string,
  sourceText: string,
  llmItinerary: string,
  llmCaptain: string,
): boolean {
  const combined = `${llmItinerary} ${llmCaptain}`;
  if (scriptId === 'iceland_laugavegur_heavy_trek') {
    return /川西|长坪沟|毕棚沟|贡嘎/.test(combined) && /冰岛|兰格维格|Laugavegur/i.test(sourceText);
  }
  if (scriptId === 'chuanxi_heavy_trek') {
    return /冰岛|兰格维格|Laugavegur/i.test(combined) && /川西|长坪沟|毕棚沟|贡嘎/.test(sourceText);
  }
  return false;
}

/**
 * LLM 主解析后的规则校准 — 规则引擎负责兜底字段、剧本一致性校验与 Hard Gates 加严。
 * parse_source 保持 `llm`（表示语义主路径仍为 LLM）。
 */
export function calibrateLlmPayloadWithRules(
  freeText: string,
  llmPayload: VibeLlmParsePayload,
): VibeLlmParsePayload {
  const text = freeText.trim();
  if (!text) return llmPayload;

  const rulesPayload = parseVibeFreeTextWithRules(text);
  const script = resolveRecruitmentScript(text);

  const vibe_chips = mergeChipsWithRulesCalibration(
    llmPayload.vibe_chips,
    rulesPayload.vibe_chips,
    script,
  );

  let teamwork_contract_model = llmPayload.teamwork_contract_model;
  if (script && teamwork_contract_model !== script.teamworkModel) {
    teamwork_contract_model = script.teamworkModel;
  } else if (llmPayload.vibe_chips.length === 0) {
    teamwork_contract_model = rulesPayload.teamwork_contract_model;
  }

  const hard_gates = mergeHardGatesWithRulesCalibration(
    llmPayload.hard_gates,
    rulesPayload.hard_gates,
    script,
  );

  let slot_definitions = llmPayload.slot_definitions;
  if (
    isGenericVibeSlotDefinitions(slot_definitions) ||
    (script && isPremiumTrekkingScriptId(script.id)) ||
    (script && !slotsAlignWithRules(slot_definitions, rulesPayload.slot_definitions))
  ) {
    slot_definitions = rulesPayload.slot_definitions;
  }

  const derived_fields = pickDerivedFields(
    llmPayload.derived_fields,
    rulesPayload.derived_fields,
    script,
    text,
  );

  const behavioral_contracts = buildBehavioralContracts(vibe_chips);
  const scriptMeta = resolveRecruitmentScript(text);

  return {
    ...llmPayload,
    vibe_chips: vibe_chips.length > 0 ? vibe_chips : rulesPayload.vibe_chips,
    teamwork_contract_model,
    hard_gates,
    slot_definitions,
    behavioral_contracts,
    contract_hint: buildContractHint(teamwork_contract_model, behavioral_contracts),
    derived_fields,
    parse_source: 'llm',
    parse_version: VIBE_LLM_PARSE_VERSION,
    recruitment_script_id: scriptMeta?.id ?? llmPayload.recruitment_script_id ?? null,
    recruitment_scene_category: scriptMeta?.sceneCategory ?? null,
  };
}

export function normalizeVibeLlmPayload(raw: unknown, source: 'llm' | 'rules'): VibeLlmParsePayload {
  const fallback = parseVibeFreeTextWithRules('');
  if (!raw || typeof raw !== 'object') {
    return { ...fallback, parse_source: source };
  }

  const obj = raw as Record<string, unknown>;
  const chipsRaw = Array.isArray(obj.vibe_chips) ? obj.vibe_chips : [];
  const vibe_chips: VibeChip[] = chipsRaw.flatMap((c, index): VibeChip[] => {
      if (typeof c === 'string') {
        const label = c.trim();
        if (!label) return [];
        const rule = VIBE_TAG_LEXICON.find((r) => r.chipLabel === label);
        return [
          {
            id: rule?.id ?? slugify(label),
            label,
            lexiconKey: rule?.id,
          },
        ];
      }
      if (!c || typeof c !== 'object') return [];
      const chip = c as Record<string, unknown>;
      const label = String(chip.label ?? chip.id ?? `标签${index + 1}`);
      return [
        {
          id: String(chip.id ?? slugify(label)),
          label,
          lexiconKey: typeof chip.lexiconKey === 'string' ? chip.lexiconKey : undefined,
        },
      ];
    });

  const teamwork_contract_model = normalizeTeamworkContractModel(
    String(obj.teamwork_contract_model ?? 'Co-Creation'),
  );

  const hg = (obj.hard_gates ?? {}) as Record<string, unknown>;
  const hard_gates: VibeHardGates = {
    budget_range:
      typeof hg.budget_range === 'string' && hg.budget_range.trim()
        ? hg.budget_range.trim()
        : null,
    education_baseline: (hg.education_baseline as VibeHardGates['education_baseline']) ?? 'None',
    industry_preference: Array.isArray(hg.industry_preference)
      ? hg.industry_preference.map(String)
      : [],
    security_level: normalizeSecurityLevel(String(hg.security_level ?? 'Standard')),
  };

  const slotsRaw = Array.isArray(obj.slot_definitions) ? obj.slot_definitions : [];
  const slot_definitions: VibeSlotDefinition[] = slotsRaw
    .filter((s) => s && typeof s === 'object')
    .map((s, index) => {
      const slot = s as Record<string, unknown>;
      const expected_tag = String(slot.expected_tag ?? `旅伴拼图位 ${index + 1}`);
      return {
        slot_id: Number(slot.slot_id ?? index + 1),
        expected_tag,
        reason: formatVibeSlotReason(String(slot.reason ?? '动态拼图补位')),
        targetMbtiTypes: mapTagToMbti(expected_tag),
      };
    });

  const behavioral_contracts = buildBehavioralContracts(vibe_chips);

  const llmItinerary = typeof obj.itinerary_summary === 'string' ? obj.itinerary_summary.trim() : '';
  const llmCaptain = typeof obj.captain_message === 'string' ? obj.captain_message.trim() : '';
  const derivedRaw = obj.derived_fields as Record<string, unknown> | undefined;
  let derived_fields: VibeDerivedRecruitmentFields | undefined;
  if (llmItinerary || llmCaptain) {
    derived_fields = {
      itinerary_summary: clampDerivedField(llmItinerary),
      captain_message: clampDerivedField(llmCaptain),
    };
  } else if (derivedRaw && typeof derivedRaw === 'object') {
    derived_fields = {
      itinerary_summary: clampDerivedField(String(derivedRaw.itinerary_summary ?? '')),
      captain_message: clampDerivedField(String(derivedRaw.captain_message ?? '')),
    };
  }

  const payload: VibeLlmParsePayload = {
    vibe_chips: vibe_chips.length > 0 ? vibe_chips : fallback.vibe_chips,
    teamwork_contract_model,
    hard_gates,
    slot_definitions: slot_definitions.length > 0 ? slot_definitions : fallback.slot_definitions,
    behavioral_contracts,
    contract_hint: buildContractHint(teamwork_contract_model, behavioral_contracts),
    derived_fields,
    parse_source: source,
    parse_version: VIBE_LLM_PARSE_VERSION,
  };

  if (!payload.derived_fields?.itinerary_summary && typeof obj.source_text === 'string') {
    payload.derived_fields = extractRecruitmentFieldDrafts(obj.source_text, payload.vibe_chips);
  }

  return payload;
}

export function combineRecruitmentFreeText(parts: {
  vibeFreeText?: string | null;
  preferenceNotes?: string | null;
  captainMessage?: string | null;
  itinerarySummary?: string | null;
}): string {
  return [parts.vibeFreeText, parts.preferenceNotes, parts.captainMessage, parts.itinerarySummary]
    .filter((p) => p?.trim())
    .join('\n')
    .trim();
}

export function attachVibePayloadToSnapshot<T extends object>(
  snapshot: T,
  payload: VibeLlmParsePayload | null,
  sourceText?: string | null,
): T & { _vibeLlm?: VibeLlmParsePayload; _vibeParse?: VibeLlmParseView } {
  if (!payload) return snapshot;
  const stored: VibeLlmParsePayload = sourceText?.trim()
    ? { ...payload, source_text: sourceText.trim() }
    : payload;
  const enriched = enrichVibePayloadForRead(stored);
  const parseView = buildVibeLlmParseViewFromPayload(enriched);
  return attachVibeParseSnapshot(snapshot, enriched, parseView);
}

export function buildVibeLlmParseViewFromPayload(payload: VibeLlmParsePayload): VibeLlmParseView {
  const suggestedPlanningStyle = mapTeamworkModelToPlanningStyle(payload.teamwork_contract_model);
  const derived = payload.derived_fields;
  const suggestedFields = deriveRecruitmentFormSuggestions(
    payload.source_text ?? '',
    payload.vibe_chips,
    payload.hard_gates,
  );
  const trekkingOrchestration = buildTrekkingVibeOrchestrationPlan(payload);
  return {
    payload,
    suggestedPlanningStyle,
    suggestedPlanningStyleLabel: resolveTeamworkStyleLabel(suggestedPlanningStyle) ?? suggestedPlanningStyle,
    teamworkContractModelLabel: resolveVibeTeamworkContractModelLabel(payload.teamwork_contract_model),
    suggestedItinerarySummary: derived?.itinerary_summary ?? '',
    suggestedCaptainMessage: derived?.captain_message ?? '',
    suggestedFields,
    realtime_ready: payload.vibe_chips.length > 0,
    trekkingOrchestration,
    routeTemplateMatch: buildRouteTemplateIntentMatchPlan({
      sourceText: payload.source_text ?? '',
      payload,
      suggestedFields,
      trekkingOrchestration,
    }),
  };
}

function mergeSuggestedFields(
  base: VibeRecruitmentFormSuggestions,
  raw: unknown,
): VibeRecruitmentFormSuggestions {
  if (!raw || typeof raw !== 'object') return base;
  const sf = raw as Record<string, unknown>;
  return {
    destination: pickNullableString(sf.destination) ?? base.destination,
    destinationRegionId: pickNullableString(sf.destinationRegionId ?? sf.destination_region_id) ?? base.destinationRegionId,
    destinationRegionLabel:
      pickNullableString(sf.destinationRegionLabel ?? sf.destination_region_label) ?? base.destinationRegionLabel,
    destinationSubScopeId:
      pickNullableString(sf.destinationSubScopeId ?? sf.destination_sub_scope_id) ?? base.destinationSubScopeId,
    destinationSubScopeLabel:
      pickNullableString(sf.destinationSubScopeLabel ?? sf.destination_sub_scope_label) ??
      base.destinationSubScopeLabel,
    departureLabel: pickNullableString(sf.departureLabel ?? sf.departure_label) ?? base.departureLabel,
    budgetMinCents: pickNullableInt(sf.budgetMinCents ?? sf.budget_min_cents) ?? base.budgetMinCents,
    budgetMaxCents: pickNullableInt(sf.budgetMaxCents ?? sf.budget_max_cents) ?? base.budgetMaxCents,
    travelMode: pickTravelMode(sf.travelMode ?? sf.travel_mode) ?? base.travelMode,
    tripMoodTag: pickTripMoodTag(sf.tripMoodTag ?? sf.trip_mood_tag) ?? base.tripMoodTag,
    preferenceNotes: pickNullableString(sf.preferenceNotes ?? sf.preference_notes) ?? base.preferenceNotes,
    recruitmentScriptId:
      pickNullableString(sf.recruitmentScriptId ?? sf.recruitment_script_id) ?? base.recruitmentScriptId,
    recruitmentSceneCategory:
      pickNullableString(sf.recruitmentSceneCategory ?? sf.recruitment_scene_category) ??
      base.recruitmentSceneCategory,
  };
}

function pickNullableString(value: unknown): string | null {
  if (value == null || value === '') return null;
  return String(value);
}

function pickNullableInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickTravelMode(value: unknown): VibeRecruitmentFormSuggestions['travelMode'] {
  const v = String(value ?? '');
  if (v === 'self_drive' || v === 'public_transit' || v === 'mixed' || v === 'other') return v;
  return null;
}

function pickTripMoodTag(value: unknown): VibeRecruitmentFormSuggestions['tripMoodTag'] {
  const v = String(value ?? '');
  if (v === 'relax' || v === 'adventure' || v === 'healing' || v === 'social') return v;
  return null;
}

function pickPlanningStyle(value: unknown): VibeLlmParseView['suggestedPlanningStyle'] | null {
  const v = String(value ?? '');
  if (v === 'full_managed' || v === 'co_planning' || v === 'casual_play') return v;
  return null;
}

/** 发布 create — 归一化客户端提交的 vibeParse（与 POST /vibe-llm/parse 响应同构） */
export function normalizeClientVibeParseInput(
  raw: unknown,
  options?: { sourceText?: string | null },
): VibeLlmParseView | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const payloadRaw = obj.payload ?? obj;
  if (!payloadRaw || typeof payloadRaw !== 'object') return null;

  const parseSource =
    (obj.payload && typeof obj.payload === 'object'
      ? (obj.payload as Record<string, unknown>).parse_source
      : obj.parse_source) ?? 'rules';
  const source = parseSource === 'llm' ? 'llm' : 'rules';

  let payload = normalizeVibeLlmPayload(payloadRaw, source);
  if (options?.sourceText?.trim()) {
    payload = { ...payload, source_text: options.sourceText.trim() };
  } else {
    const nestedSource = (payloadRaw as Record<string, unknown>).source_text;
    if (typeof nestedSource === 'string' && nestedSource.trim()) {
      payload = { ...payload, source_text: nestedSource.trim() };
    }
  }
  if (payload.parse_source === 'llm' && payload.source_text?.trim()) {
    payload = calibrateLlmPayloadWithRules(payload.source_text, payload);
  }
  payload = enrichVibePayloadForRead(payload);

  const rebuilt = buildVibeLlmParseViewFromPayload(payload);
  return {
    payload,
    suggestedPlanningStyle: pickPlanningStyle(obj.suggestedPlanningStyle ?? obj.suggested_planning_style) ?? rebuilt.suggestedPlanningStyle,
    suggestedPlanningStyleLabel:
      pickNullableString(obj.suggestedPlanningStyleLabel ?? obj.suggested_planning_style_label) ??
      rebuilt.suggestedPlanningStyleLabel,
    teamworkContractModelLabel:
      pickNullableString(obj.teamworkContractModelLabel ?? obj.teamwork_contract_model_label) ??
      rebuilt.teamworkContractModelLabel,
    suggestedItinerarySummary:
      pickNullableString(obj.suggestedItinerarySummary ?? obj.suggested_itinerary_summary) ??
      rebuilt.suggestedItinerarySummary,
    suggestedCaptainMessage:
      pickNullableString(obj.suggestedCaptainMessage ?? obj.suggested_captain_message) ??
      rebuilt.suggestedCaptainMessage,
    suggestedFields: mergeSuggestedFields(rebuilt.suggestedFields, obj.suggestedFields ?? obj.suggested_fields),
    realtime_ready:
      typeof obj.realtime_ready === 'boolean' ? obj.realtime_ready : rebuilt.realtime_ready,
    trekkingOrchestration: rebuilt.trekkingOrchestration,
    routeTemplateMatch: rebuilt.routeTemplateMatch,
  };
}

export function attachVibeParseSnapshot<T extends object>(
  snapshot: T,
  payload: VibeLlmParsePayload,
  parseView: VibeLlmParseView,
): T &
  Record<typeof VIBE_LLM_SNAPSHOT_KEY, VibeLlmParsePayload> &
  Record<typeof VIBE_PARSE_SNAPSHOT_KEY, VibeLlmParseView> {
  return {
    ...snapshot,
    [VIBE_LLM_SNAPSHOT_KEY]: payload,
    [VIBE_PARSE_SNAPSHOT_KEY]: parseView,
  };
}

export function readVibeParseFromSnapshot(raw: unknown): VibeLlmParseView | null {
  if (!raw || typeof raw !== 'object') return null;
  const stored = (raw as Record<string, unknown>)[VIBE_PARSE_SNAPSHOT_KEY];
  if (stored && typeof stored === 'object') {
    const normalized = normalizeClientVibeParseInput(stored);
    if (normalized) return normalized;
  }
  const payload = readVibePayloadFromSnapshot(raw);
  if (!payload) return null;
  return buildVibeLlmParseViewFromPayload(payload);
}

export function readVibePayloadFromSnapshot(raw: unknown): VibeLlmParsePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const vibe = (raw as Record<string, unknown>)._vibeLlm;
  if (!vibe || typeof vibe !== 'object') return null;
  return enrichVibePayloadForRead(vibe as VibeLlmParsePayload);
}

export function vibeSlotsToPuzzleDeficits(
  payload: VibeLlmParsePayload,
  openCount: number,
): Array<{
  deficitDimension: 'preference';
  shortLabel: string;
  aiRationale: string;
  targetMbtiTypes: string[];
}> {
  return payload.slot_definitions.slice(0, openCount).map((slot) => ({
    deficitDimension: 'preference' as const,
    shortLabel: slot.expected_tag.startsWith('🧩')
      ? slot.expected_tag
      : `🧩 建议补位 · ${slot.expected_tag}`,
    aiRationale: slot.reason,
    targetMbtiTypes: slot.targetMbtiTypes ?? mapTagToMbti(slot.expected_tag),
  }));
}
