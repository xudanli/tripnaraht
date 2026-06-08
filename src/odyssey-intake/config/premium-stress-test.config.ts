import type { PremiumStressScenarioId, ScoreDelta } from '../types/odyssey-intake.types';

/** 前端/旧 PRD 草稿 alias →  canonical scenario id */
export const PREMIUM_STRESS_SCENARIO_ALIASES: Record<string, PremiumStressScenarioId> = {
  resource_crunch: 'resource_scarcity_replan',
  resource_scarcity: 'resource_scarcity_replan',
  convoy_division: 'convoy_division_collaboration',
  convoy_chaos: 'convoy_division_collaboration',
  premium_upcharge: 'premium_upcharge_decision',
  premium_consumption: 'premium_upcharge_decision',
};

export function resolvePremiumStressScenarioId(raw: string): PremiumStressScenarioId | null {
  const trimmed = raw.trim();
  if (
    trimmed === 'resource_scarcity_replan' ||
    trimmed === 'convoy_division_collaboration' ||
    trimmed === 'premium_upcharge_decision'
  ) {
    return trimmed;
  }
  return PREMIUM_STRESS_SCENARIO_ALIASES[trimmed] ?? null;
}

/** 高端行中博弈题 — 选项 → 后台埋点（不测 E/I、S/N） */
export const PREMIUM_STRESS_SCORE_DELTAS: Record<
  PremiumStressScenarioId,
  Record<'A' | 'B', ScoreDelta>
> = {
  resource_scarcity_replan: {
    A: { quality_baseline: 2, risk_appetite: 2 },
    B: { ambiguity_tolerance: 2, safety_first: 2 },
  },
  convoy_division_collaboration: {
    A: { control_desire: 2 },
    B: { collaborative_trait: 2 },
  },
  premium_upcharge_decision: {
    A: { financial_elasticity: 2, independence: 2 },
    B: { compromise_index: 2 },
  },
};

export const PREMIUM_STRESS_QUESTIONS = [
  {
    id: 'resource_scarcity_replan' as const,
    order: 1,
    title: '资源挤兑与替代决策',
    scenario:
      '你预订的黑沙滩奢华设计酒店因当地极端天气导致供电系统瘫痪，无法入住。此时是深夜 11 点，你唯一的两个 Plan B 是：入住人均 200 元、卫生条件普通的当地民居；或者临时冒雪连夜驱车 3 小时，前往下一个城市的五星级酒店。你会？',
    wallpaperKey: 'black_sand_luxury_outage',
    options: [
      {
        id: 'A' as const,
        label:
          '体验底线型（效率优先）：连夜驱车。我对住宿品质有硬性底线，无法接受低质低效的妥协，宁愿承受行中风险去换取确定的质感。',
      },
      {
        id: 'B' as const,
        label:
          '随遇而安型（安全优先）：就近入住。高压环境下盲目深夜长途驱车风险过大，我愿意降低物欲标准来换取身体的休息和绝对的安全。',
      },
    ],
  },
  {
    id: 'convoy_division_collaboration' as const,
    order: 2,
    title: '行中共事分工与协同',
    scenario:
      '在长途自驾车队中，原定负责 Day 3 导航和订餐的队员因为突发工作会议需要在线处理，导致整个下午的行程安排陷入完全混乱和低效等待。面对这种突发状况，你的真实本能反应是？',
    wallpaperKey: 'convoy_roadside_chaos',
    options: [
      {
        id: 'A' as const,
        label:
          '强力接管型（全托管倾向）：极为不耐烦。我无法忍受任何低效，会立刻拿过对方的权限强力接管，全权决策接下来的路线，让队伍重回正轨。',
      },
      {
        id: 'B' as const,
        label:
          '边界清晰型（一起策划倾向）：明确分工。理解职场突发，但他不该影响团队。要求大家立刻在路边开个 5 分钟的微型短会，重新 democratic 分配今天的后勤任务。',
      },
    ],
  },
  {
    id: 'premium_upcharge_decision' as const,
    order: 3,
    title: '溢价消费与附加值认同',
    scenario:
      '行程中发现原本包含在路线内的一个极赞的私家直升机看冰川项目，因临时政策变动需要自费增补 3000 元/人。搭子中有人觉得溢价过高强烈反对，而你非常想去，此时你会？',
    wallpaperKey: 'helicopter_glacier_premium',
    options: [
      {
        id: 'A' as const,
        label:
          '自我悦己型：各玩各的。时间成本和体验溢价最宝贵，我不会因为他人的预算上限委屈自己，各付各的，我自己去参加，结束再汇合。',
      },
      {
        id: 'B' as const,
        label:
          '团队妥协型：放弃或寻找替代。出来拼车组队是一场契约，我更看重团队整体氛围的齐整，愿意为了团队和谐放弃部分个人高光体验。',
      },
    ],
  },
];
