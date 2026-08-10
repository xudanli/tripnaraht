/**
 * 冰岛自驾 P0 决策题注册表 — 模板＋上下文实例化，禁止 LLM 临时编造方案骨架。
 */

import type { DecisionDefinition } from './travel-decision.types';

export const DECISION_REGISTRY: DecisionDefinition[] = [
  {
    decisionKey: 'VEHICLE_ROAD_FIT',
    category: 'VEHICLE',
    title_zh: '租什么车型',
    question_zh: '这次自驾应选两驱还是四驱？',
    reason_zh: '车型决定可走道路、季节安全边际与预算。',
    explicitPatterns: [
      /租什么(?:车型|车)|该租什么|应租什么|推荐(?:什么)?车型|选什么车型|什么车型(?:合适|好|更)?|租哪(?:种|款)车/i,
      /租.{0,8}(?:两驱|四驱|2WD|4WD|SUV)|(?:两驱|四驱).{0,8}(?:还是|或|还是选)|应该租.{0,12}(?:车|SUV|四驱|两驱)|车型.{0,8}(?:选|怎么|哪个|如何)/i,
      /should\s+we\s+rent.{0,20}(2wd|4wd|suv)|2wd\s+or\s+4wd|what\s+(?:car|vehicle)\s+to\s+rent/i,
    ],
    dimensionProfile: ['SAFETY', 'COST', 'FLEXIBILITY', 'EXPERIENCE'],
    persistenceTarget: 'DECISION_CONTRACT',
    optionSkeleton: [
      {
        optionId: '2WD',
        label_zh: '两驱轿车 / 小车',
        strategy_zh: '控制预算，仅走铺装主路，避开 F-road 与高地。',
      },
      {
        optionId: '4WD',
        label_zh: '四驱 / SUV',
        strategy_zh: '提高碎石路与冬季安全边际，保留高地与部分 F 路选项。',
      },
      {
        optionId: '4WD_PLUS',
        label_zh: '高底盘四驱',
        strategy_zh: '最大化路线弹性，适合明确要走高地或恶劣天气窗口。',
      },
    ],
  },
  {
    decisionKey: 'RENTAL_INSURANCE',
    category: 'INSURANCE',
    title_zh: '租车保险怎么选',
    question_zh: '基础险、砂石险、全险应选哪一档？',
    reason_zh: '冰岛碎石与风损常见，保险档位直接影响最坏情况成本。',
    explicitPatterns: [
      /保险.{0,10}(?:选|怎么|哪|档)|(?:砂石|全险|CDW|SCDW).{0,8}(?:要不要|值不值|选)|要不要买.{0,8}保险/i,
    ],
    dimensionProfile: ['SAFETY', 'COST', 'FLEXIBILITY'],
    persistenceTarget: 'DECISION_CONTRACT',
    optionSkeleton: [
      {
        optionId: 'BASIC',
        label_zh: '基础险',
        strategy_zh: '最低日费，自留额高，适合铺装路短途且接受风险。',
      },
      {
        optionId: 'GRAVEL',
        label_zh: '基础＋砂石/玻璃',
        strategy_zh: '覆盖碎石路常见损伤，多数南岸自驾的均衡选择。',
      },
      {
        optionId: 'FULL',
        label_zh: '接近全险',
        strategy_zh: '降低最坏情况自付，适合冬季、新手或高价值车型。',
      },
    ],
  },
  {
    decisionKey: 'TRIP_SCOPE',
    category: 'ROUTE_STRATEGY',
    title_zh: '环岛还是南岸',
    question_zh: '路线范围应走完整环岛、南岸深度，还是南岸＋斯奈山？',
    reason_zh: '覆盖范围与驾驶负荷、住宿密度、季节日照直接冲突。',
    explicitPatterns: [
      /环岛.{0,12}(?:还是|或)|南岸.{0,12}(?:还是|或)|走完整环岛|只走南岸|南岸\+?斯奈|斯奈山.{0,8}(?:还是|或)/i,
      /ring\s*road\s+or|full\s+circle\s+or\s+south/i,
    ],
    dimensionProfile: ['SAFETY', 'TIME', 'FATIGUE', 'EXPERIENCE', 'COST'],
    persistenceTarget: 'TRIP_PREFERENCE',
    optionSkeleton: [
      {
        optionId: 'SOUTH_COAST',
        label_zh: '南岸深度',
        strategy_zh: '缩小空间范围，提高停留质量与稳定性。',
      },
      {
        optionId: 'RING_ROAD',
        label_zh: '完整环岛',
        strategy_zh: '扩大覆盖，接受更高日均驾驶与住宿周转。',
      },
      {
        optionId: 'SOUTH_PLUS_SNAEFELLSNES',
        label_zh: '南岸＋斯奈山',
        strategy_zh: '在体验丰富度与驾驶负荷之间折中。',
      },
    ],
  },
  {
    decisionKey: 'ACCOMMODATION_MOVEMENT',
    category: 'ACCOMMODATION_STRATEGY',
    title_zh: '少换酒店还是减少驾驶',
    question_zh: '住宿应少换据点，还是跟着路线频繁换宿以减驾驶？',
    reason_zh: '换宿次数与单日车程相互对冲，需明确优化目标。',
    explicitPatterns: [
      /少换酒店|不想.{0,6}换酒店|频繁换酒店|固定.{0,4}住宿|减少驾驶.{0,12}酒店|酒店.{0,12}驾驶/i,
    ],
    dimensionProfile: ['TIME', 'FATIGUE', 'COST', 'EXPERIENCE', 'FLEXIBILITY'],
    persistenceTarget: 'TRIP_PREFERENCE',
    optionSkeleton: [
      {
        optionId: 'HUB_STAY',
        label_zh: '少换据点（Hub）',
        strategy_zh: '同一住宿多日辐射，降低打包搬运行李成本。',
      },
      {
        optionId: 'FOLLOW_ROUTE',
        label_zh: '沿线路换宿',
        strategy_zh: '缩短单日回程驾驶，接受更多 check-in。',
      },
      {
        optionId: 'HYBRID',
        label_zh: '两段据点',
        strategy_zh: '南岸与首都圈各一个据点，折中搬迁与车程。',
      },
    ],
  },
  {
    decisionKey: 'GLACIER_HIKE',
    category: 'EXPERIENCE',
    title_zh: '是否参加冰川徒步',
    question_zh: '要不要加入冰川徒步（或轻量替代）？',
    reason_zh: '体验强度、时间窗、预算与体能同时受影响。',
    explicitPatterns: [
      /冰川徒步.{0,10}(?:要不要|值不值|值得|参加吗|加入)|要不要.{0,8}冰川徒步|冰川徒步值得/i,
    ],
    dimensionProfile: ['EXPERIENCE', 'FATIGUE', 'COST', 'TIME', 'SAFETY'],
    persistenceTarget: 'TRIP_PREFERENCE',
    optionSkeleton: [
      {
        optionId: 'JOIN',
        label_zh: '参加冰川徒步',
        strategy_zh: '保留高光体验，预留半日以上时间与体能。',
      },
      {
        optionId: 'SKIP',
        label_zh: '不参加',
        strategy_zh: '把时间留给黑沙滩 / 冰河湖步行，降低强度与费用。',
      },
      {
        optionId: 'LIGHT_ALT',
        label_zh: '轻量替代（观景／短走）',
        strategy_zh: '靠近冰川但不上冰，兼顾体验与安全边际。',
      },
    ],
  },
  {
    decisionKey: 'SILFRA_SNORKELING',
    category: 'EXPERIENCE',
    title_zh: '是否加入 Silfra 浮潜',
    question_zh: '要不要安排 Silfra / 裂谷浮潜？',
    reason_zh: '水温、预约、体能与当日黄金圈节奏强耦合。',
    explicitPatterns: [/Silfra|浮潜.{0,8}(?:要不要|值得)|裂谷浮潜/i],
    dimensionProfile: ['EXPERIENCE', 'COST', 'TIME', 'FATIGUE', 'SAFETY'],
    persistenceTarget: 'TRIP_PREFERENCE',
    optionSkeleton: [
      { optionId: 'JOIN', label_zh: '参加浮潜', strategy_zh: '保留独特水体体验，需预留更衣与体温恢复。' },
      { optionId: 'SKIP', label_zh: '不参加', strategy_zh: '黄金圈保持步行景点密度。' },
      { optionId: 'DEFER', label_zh: '作为候补', strategy_zh: '有取消名额再上，不锁死当日节奏。' },
    ],
  },
  {
    decisionKey: 'ARRIVAL_DAY_LOAD',
    category: 'PACE',
    title_zh: '落地日是否长途驾驶',
    question_zh: '抵达当天要不要直接开长途？',
    reason_zh: '航班时刻、日照与疲劳决定首日是否应压缩。',
    explicitPatterns: [/落地日|抵达当天|第一天.{0,10}(?:开|驾驶|长途)|首日.{0,8}(?:维克|南岸)/i],
    dimensionProfile: ['SAFETY', 'FATIGUE', 'TIME', 'EXPERIENCE'],
    persistenceTarget: 'ITINERARY_DRAFT',
    optionSkeleton: [
      { optionId: 'LIGHT', label_zh: '轻量首日（首都圈）', strategy_zh: '提车＋蓝湖或市区，次日再南下。' },
      { optionId: 'MODERATE', label_zh: '中等推进（至南岸近端）', strategy_zh: '有限车程抵达第一站住宿。' },
      { optionId: 'PUSH', label_zh: '强推进（直达维克一带）', strategy_zh: '最大化行程天数，接受疲劳与夜驾风险。' },
    ],
  },
  {
    decisionKey: 'DAILY_PACE',
    category: 'PACE',
    title_zh: '体验丰富还是节奏轻松',
    question_zh: '日程应偏体验密度，还是偏轻松驾驶？',
    reason_zh: '日负荷目标影响景点数量与住宿间距。',
    explicitPatterns: [
      /节奏.{0,8}(?:轻松|紧凑).{0,12}(?:还是|或)|体验丰富还是|偏体验还是偏轻松|应该.{0,6}(?:轻松|赶路)|驾驶轻松还是/i,
    ],
    dimensionProfile: ['FATIGUE', 'EXPERIENCE', 'TIME', 'FLEXIBILITY'],
    persistenceTarget: 'TRIP_PREFERENCE',
    optionSkeleton: [
      { optionId: 'RICH', label_zh: '体验优先', strategy_zh: '更多停点，接受更高车程与赶路感。' },
      { optionId: 'BALANCED', label_zh: '均衡', strategy_zh: '每日 1–2 个高光＋缓冲。' },
      { optionId: 'EASY', label_zh: '轻松优先', strategy_zh: '削减停点与驾驶，保留恢复时间。' },
    ],
  },
  {
    decisionKey: 'WINTER_ROUTE_RISK',
    category: 'ROUTE_STRATEGY',
    title_zh: '冬季路线保守还是原计划',
    question_zh: '冬季应坚持原路线，还是改为更保守方案？',
    reason_zh: '季节、车辆与道路组合可能使原计划不可执行。',
    explicitPatterns: [/冬季.{0,10}(?:路线|保守)|保守路线|原路线.{0,8}(?:还是|风险)/i],
    dimensionProfile: ['SAFETY', 'FLEXIBILITY', 'EXPERIENCE', 'TIME'],
    persistenceTarget: 'TRIP_PREFERENCE',
    optionSkeleton: [
      { optionId: 'KEEP', label_zh: '坚持原路线', strategy_zh: '保留覆盖，依赖天气窗口与四驱。' },
      { optionId: 'CONSERVATIVE', label_zh: '保守南岸／主路', strategy_zh: '削减高地与边缘路段。' },
      { optionId: 'FLEX_BUFFER', label_zh: '原路线＋机动缓冲日', strategy_zh: '保留目标但预留改期空间。' },
    ],
  },
  {
    decisionKey: 'LIVE_CONTINUE_OR_ABORT',
    category: 'LIVE_EXECUTION',
    title_zh: '继续、缩短还是返回',
    question_zh: '当前条件下应继续前往、缩短行程，还是返回住宿？',
    reason_zh: '行中风险下需要可执行的即时选择，而非泛化建议。',
    explicitPatterns: [
      /今天.{0,8}(?:继续|返回|提前结束)|还要不要继续|继续前往|提前结束|返回酒店|风大.{0,10}(?:继续|取消|绕行)/i,
    ],
    dimensionProfile: ['SAFETY', 'TIME', 'FATIGUE', 'EXPERIENCE'],
    persistenceTarget: 'EXECUTION_ACTION',
    optionSkeleton: [
      { optionId: 'CONTINUE', label_zh: '按原计划继续', strategy_zh: '接受当前风险窗口，监控路况。' },
      { optionId: 'SHORTEN', label_zh: '缩短今日目标', strategy_zh: '保留最近高光，取消远端点。' },
      { optionId: 'RETURN', label_zh: '返回／就地结束', strategy_zh: '优先安全与恢复，改日再走。' },
    ],
  },
];

export function getDecisionDefinition(decisionKey: string): DecisionDefinition | undefined {
  return DECISION_REGISTRY.find((d) => d.decisionKey === decisionKey);
}
