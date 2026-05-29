/**
 * iceland.rentalGuidance — 冰岛自驾租车「决策层」结构化知识
 *
 * 不接单一 OTA：输出聚合入口、本地高信任车行画像、保险/F-road 检查项与官方风险源，
 * 与轻量路径 `car_rental` MCP（Booking 比价）及 `safetravel.get_advisories` / F-road / 天气 skill 组合使用。
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput, SkillMetadata } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';

export type IcelandRentalIntentProfile =
  | 'default'
  | 'peace_of_mind'
  | 'trusted_default'
  | 'budget_sensitive'
  | 'f_road_focus';

export interface IcelandRentalGuidanceInput extends SkillInput {
  /** 用户原话；用于自动推断 `intent_profile`（当未显式传入时） */
  user_query?: string;
  /** 用于 provider 排序与话术侧重点；缺省则根据 `user_query` 推断，否则为 default */
  intent_profile?: IcelandRentalIntentProfile;
}

export type IcelandRentalProviderTier = 'aggregation' | 'trusted_local';

export interface IcelandRentalPortalRef {
  id: string;
  name: string;
  url: string;
  tier: IcelandRentalProviderTier;
  /** 在 TripNARA 管线中的角色（非爬取承诺） */
  role_zh: string;
  /** 典型适用问法 */
  suitability_zh: string[];
}

export interface IcelandRentalLocalBrandProfile {
  id: string;
  name: string;
  url: string;
  positioning_zh: string;
  insurance_notes_zh: string[];
  f_road_notes_zh: string[];
  trust_tags: string[];
}

export interface IcelandRentalGuidanceOutput extends SkillOutput {
  intent_profile: IcelandRentalIntentProfile;
  /** 官方与半官方风险输入（须与实时 skill / MCP 组合） */
  risk_control: {
    road_is: { label: string; url: string; notes_zh: string };
    vedur: { label: string; url: string; notes_zh: string };
    safetravel: { label: string; url: string; notes_zh: string };
    vegagerdin_app_zh: string;
  };
  aggregation_portals: IcelandRentalPortalRef[];
  trusted_local_providers: IcelandRentalLocalBrandProfile[];
  insurance_checklist_zh: string[];
  vehicle_policy_hints_zh: string[];
  /** 与现有 Booking.com 租车 MCP 的分工说明 */
  booking_mcp_complement_zh: string;
  /** 推荐调用顺序（skill / 工具 id） */
  suggested_pipeline: string[];
  summary_zh: string;
}

const RISK_CONTROL = {
  road_is: {
    label: 'road.is',
    url: 'https://www.road.is/',
    notes_zh: 'F-road 开放、封路、积雪与施工；决定能否用两驱/是否必须四驱与高离地间隙。',
  },
  vedur: {
    label: 'Vedur.is',
    url: 'https://en.vedur.is/',
    notes_zh: '大风与风暴警报、横风风险；直接影响南岸开阔路段与开门安全。',
  },
  safetravel: {
    label: 'SafeTravel.is',
    url: 'https://safetravel.is/',
    notes_zh: '旅行安全与路况相关官方提示；可与 RSS / itinerary 路段 ref 对齐。',
  },
  vegagerdin_app_zh: '路况移动端：可在应用商店搜索「Vegagerðin」安装官方路况 App。',
} as const;

const AGGREGATION_PORTALS: IcelandRentalPortalRef[] = [
  {
    id: 'northbound',
    name: 'Northbound Iceland Car Rental',
    url: 'https://www.northbound.is/',
    tier: 'aggregation',
    role_zh: '聚合比价首入口之一；保险与车型说明相对完整，适合与结构化报价 skill 对接。',
    suitability_zh: ['实时比价', '保险对比', '高地/F-road 车型筛选'],
  },
  {
    id: 'guide_to_iceland',
    name: 'Guide to Iceland — Car Rental',
    url: 'https://guidetoiceland.is/rent-a-car-in-iceland',
    tier: 'aggregation',
    role_zh: '本地大流量平台；结构化内容与 SEO 友好，适合 RAG / semantic retrieval。',
    suitability_zh: ['环岛车型建议', '预算区间筛选', '与攻略内容联检'],
  },
  {
    id: 'discover_cars',
    name: 'Discover Cars — Iceland',
    url: 'https://www.discovercars.com/iceland/',
    tier: 'aggregation',
    role_zh: '国际化比价；车型标准化好，适合多国家复用 ranking。',
    suitability_zh: ['国际卡支付习惯', '跨供应商排序', '标准化车型对比'],
  },
];

const LOCAL_BRANDS: IcelandRentalLocalBrandProfile[] = [
  {
    id: 'blue',
    name: 'Blue Car Rental',
    url: 'https://www.bluecarrental.is/',
    positioning_zh: '社区高频「第一梯队」本地行；KEF 周边取还成熟，砂石险与游客流程友好，可作 trusted default。',
    insurance_notes_zh: ['关注 gravel protection（砂石）与 wind/门损条款', '核对 CDW/TP 起赔额与信用卡预授权策略'],
    f_road_notes_zh: ['F-road 须合规四驱车型与开放时间；以 road.is 为准', '禁止两驱驶入封闭 F 路'],
    trust_tags: ['trusted_default', 'kef_adjacent', 'gravel_friendly'],
  },
  {
    id: 'zero',
    name: 'Zero Car Rental',
    url: 'https://zerocar.is/',
    positioning_zh: '偏「省心」：强调低自赔/道路救援打包等卖点（以官网条款为准），适合 peace-of-mind 画像。',
    insurance_notes_zh: ['逐项核对「0 deductible」适用范围与除外责任', '确认救援地理范围是否含高地岔路'],
    f_road_notes_zh: ['F-road 仍受道路与气象约束；车型合规与 road.is 同步核验'],
    trust_tags: ['peace_of_mind', 'roadside_bundle'],
  },
  {
    id: 'lotus',
    name: 'Lotus Car Rental',
    url: 'https://www.lotuscarrental.is/',
    positioning_zh: '口碑型本地行；常主打全险套餐性价比，适合预算敏感但仍要全险覆盖的用户。',
    insurance_notes_zh: ['对比 Platinum/全险套餐与起赔额', '确认砂石/灰损是否单列附加险'],
    f_road_notes_zh: ['高地计划必须与 F-road 开放窗口对齐'],
    trust_tags: ['budget_sensitive', 'full_coverage_value'],
  },
  {
    id: 'lava',
    name: 'Lava Car Rental',
    url: 'https://lavacarrental.is/',
    positioning_zh: '南岸 + 黄金圈等经典线常用本地选项之一；适合简化型自驾与中度预算。',
    insurance_notes_zh: ['核对风损/开门险是否在基础险外', '碎石与灰损是否需单独加购'],
    f_road_notes_zh: ['无高地计划也应保留 vedur 大风与侧风预案'],
    trust_tags: ['south_coast', 'simplified_trips'],
  },
];

const INSURANCE_CHECKLIST_ZH = [
  '砂石险（Gravel / GP）与火山灰险（Ash）是否在计划路段内有效。',
  '大风/开门损、底盘与轮毂、涉水与河滩穿越是否在除外条款。',
  'CDW/TP 起赔额、信用卡预授权与押金策略（尤其「省心」套餐）。',
  '救援（Roadside）地理范围：是否含内陆岔路与 F-road 关闭后的改道。',
];

const VEHICLE_HINTS_ZH = [
  'F-road / 内陆：仅允许合规四驱与高离地间隙；以 road.is 开放状态为准。',
  '南岸开阔段：横风与开门风险高；车型高度与受风面积影响稳定性。',
  '冬季外季节仍可能有暴风与临时封路；出发前后用 vedur + road.is 双检。',
];

const PIPELINE = [
  'iceland.rentalGuidance（本 skill：策略与来源）',
  'iceland.routeFeasibility（segment 约束裁决：组合 P0）',
  'iceland.gasAndEvChargePlanner（补给/充电 v0：能源基准 + 种子站）',
  'safetravel.get_advisories（官方安全 RSS）',
  'iceland.daylightWindow（日照与安全驾驶窗）',
  'iceland.weatherSeverityClassifier（天气→运行语义）',
  'iceland.windRisk（横风与房车暴露度）',
  'world.realtimeWeather / weather.search（气象实况与预警）',
  'iceland.fRoadStatus（F-road 统一物理权限视图）',
  'fRoad.check（如涉及 F-road：gate 裁决）',
  'live_tool.mcp.car_rental（Booking.com 结构化比价，需日期与 MCP 配置）',
];

function rankLocalBrands(profile: IcelandRentalIntentProfile): IcelandRentalLocalBrandProfile[] {
  const score = (p: IcelandRentalLocalBrandProfile): number => {
    let s = 0;
    if (profile === 'peace_of_mind' && p.trust_tags.includes('peace_of_mind')) s += 10;
    if (profile === 'trusted_default' && p.trust_tags.includes('trusted_default')) s += 10;
    if (profile === 'budget_sensitive' && p.trust_tags.includes('budget_sensitive')) s += 10;
    if (profile === 'f_road_focus') s += p.f_road_notes_zh.length;
    if (profile === 'default') {
      if (p.id === 'blue') s += 5;
    }
    return s;
  };
  return [...LOCAL_BRANDS].sort((a, b) => score(b) - score(a));
}

function buildSummary(profile: IcelandRentalIntentProfile, ranked: IcelandRentalLocalBrandProfile[]): string {
  const top = ranked[0]?.name ?? '本地车行';
  return `冰岛租车决策层：先检 ${RISK_CONTROL.road_is.label}+${RISK_CONTROL.vedur.label}，再用聚合比价（Northbound / Guide to Iceland / Discover Cars）缩小车型与保险组合，本地高信任优先参考 ${top} 等；实时报价走 Booking MCP。intent_profile=${profile}。`;
}

/** 未显式传 `intent_profile` 时，由用户话术推断画像（极简关键词，可迭代）。 */
export function refineIcelandRentalIntentProfileFromUserQuery(userQuery: string | undefined): IcelandRentalIntentProfile {
  const m = (userQuery ?? '').trim();
  if (!m) return 'default';
  if (/\bf\s*路|f-road|\bf\s*\d{2,4}\b|内陆|高地|中央高地/i.test(m)) return 'f_road_focus';
  if (/新手|第一次|怕出事|怕赔钱|稳妥|省心|零自赔|0自赔|全额|全包|不想扯皮/i.test(m)) return 'peace_of_mind';
  if (/便宜|比价|预算|划算|性价比|越便宜|低价|省钱/i.test(m)) return 'budget_sensitive';
  if (/靠谱|大车行|口碑|信得过|只要正规|不要杂牌/i.test(m)) return 'trusted_default';
  return 'default';
}

@SkillDecorator({
  name: 'iceland.rentalGuidance',
  description:
    '冰岛自驾：官方路况/气象/安全源 + 聚合比价入口 + 本地高信任车行画像 + 保险与 F-road 策略清单；与 Booking 租车 MCP 及 SafeTravel/天气/F-road skill 编排使用。',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class IcelandRentalGuidanceSkill implements Skill<IcelandRentalGuidanceInput, IcelandRentalGuidanceOutput> {
  private readonly logger = new Logger(IcelandRentalGuidanceSkill.name);

  metadata: SkillMetadata = {
    name: 'iceland.rentalGuidance',
    description:
      'iceland.rentalGuidance：结构化输出冰岛租车「风险层 + 聚合层 + 本地信任层」与保险/F-road 检查项；无外部 HTTP，供 Gate/Readiness/Planner 注入。',
    version: '1.0.0',
    category: 'world',
    toolGroup: 'DOMAIN',
    inputSchema: {
      required: [],
      typeChecks: {
        intent_profile: { type: 'string' },
        user_query: { type: 'string' },
      },
    },
  };

  async execute(input: IcelandRentalGuidanceInput): Promise<IcelandRentalGuidanceOutput> {
    const allowed: IcelandRentalIntentProfile[] = [
      'default',
      'peace_of_mind',
      'trusted_default',
      'budget_sensitive',
      'f_road_focus',
    ];
    const explicit = (input.intent_profile ?? '').trim() as IcelandRentalIntentProfile;
    const intent_profile = allowed.includes(explicit)
      ? explicit
      : refineIcelandRentalIntentProfileFromUserQuery(input.user_query);
    const trusted_local_providers = rankLocalBrands(intent_profile);
    this.logger.log(`[iceland.rentalGuidance] intent_profile=${intent_profile} (explicit=${Boolean(explicit && allowed.includes(explicit))})`);

    return {
      intent_profile,
      risk_control: { ...RISK_CONTROL },
      aggregation_portals: AGGREGATION_PORTALS,
      trusted_local_providers,
      insurance_checklist_zh: [...INSURANCE_CHECKLIST_ZH],
      vehicle_policy_hints_zh: [...VEHICLE_HINTS_ZH],
      booking_mcp_complement_zh:
        '结构化实时报价与跨国库存：继续走 `enable_live_tools` 含 `car_rental` 的 Booking.com MCP；本 skill 不替代比价，只补齐冰岛特有风险与本地行画像。',
      suggested_pipeline: [...PIPELINE],
      summary_zh: buildSummary(intent_profile, trusted_local_providers),
    };
  }
}
