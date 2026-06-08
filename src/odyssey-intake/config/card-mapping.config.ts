import type { MbtiQuadrant, OdysseyDimensionPercents, OdysseyRawScores } from '../types/odyssey-intake.types';

export interface CardMappingRule {
  mbtiPrefix: string;
  title: string;
  subtitle: string;
  /** 返回 true 时优先匹配此规则 */
  when: (ctx: CardMappingContext) => boolean;
}

export interface CardMappingContext {
  mbtiType: string;
  quadrant: MbtiQuadrant;
  percents: OdysseyDimensionPercents;
  scores: OdysseyRawScores;
}

export const ODYSSEY_CARD_THEMES: Record<
  MbtiQuadrant,
  { gradientFrom: string; gradientTo: string; accentColor?: string }
> = {
  NT: { gradientFrom: '#1C2E24', gradientTo: '#0A1410', accentColor: '#3D5A47' },
  NF: { gradientFrom: '#D97746', gradientTo: '#F5E6D3', accentColor: '#E8A87C' },
  SP: { gradientFrom: '#0A0A0A', gradientTo: '#1A1A2E', accentColor: '#00D4FF' },
  SJ: { gradientFrom: '#2C3539', gradientTo: '#8B7355', accentColor: '#A0927D' },
};

/** PRD 模块二：称号与描述映射矩阵 */
export const ODYSSEY_CARD_MAPPING_RULES: CardMappingRule[] = [
  {
    mbtiPrefix: 'INTJ',
    title: '冰岛荒原的冷酷指挥官',
    subtitle:
      '行程表精确到分钟，Excel 是你的底层武器。与其说是旅行，不如说是你在对地球进行一场高效的无情收割。',
    when: (ctx) => ctx.mbtiType === 'INTJ' && ctx.percents.J >= 75,
  },
  {
    mbtiPrefix: 'INTP',
    title: '遗世独立的数字流浪汉',
    subtitle:
      '对打卡毫无兴趣，对人类文明的发展充满好奇。你会在异国街头盯着一个排水沟研究两小时哲学问题。',
    when: (ctx) => ctx.mbtiType === 'INTP' && ctx.percents.P >= 75,
  },
  {
    mbtiPrefix: 'ENTJ',
    title: '高空跳伞的风险投资人',
    subtitle:
      '永远在决策，永远不走回头路。哪怕遇到暴雪封山，你也能在一秒钟内买下直升机头等舱票的硬核狠人。',
    when: (ctx) => ctx.mbtiType === 'ENTJ' && ctx.scores.financial_flexibility >= 2,
  },
  {
    mbtiPrefix: 'ENTP',
    title: '特立独行的无证导游',
    subtitle: 'Plan B 才是你的 Plan A。专门带搭子走无人区和没有路标的荒野，嘴里永远挂着：「别慌，抄近道」。',
    when: (ctx) => ctx.mbtiType === 'ENTP' && ctx.scores.ambiguity_tolerance >= 2,
  },
  {
    mbtiPrefix: 'INFP',
    title: '大理古城的发呆行为艺术家',
    subtitle:
      '旅行的本质是流浪。你可能在清晨的咖啡馆因为一朵云的形状看出了神，进而决定今天就在这里躺一天。',
    when: (ctx) => ctx.mbtiType === 'INFP' && ctx.percents.P >= 75,
  },
  {
    mbtiPrefix: 'INFJ',
    title: '神隐于世的宿命论朝圣者',
    subtitle:
      '默默做好了全套攻略，却在旅途中极度敏感于周遭的氛围。你总能一眼看出搭子的疲惫并递上一张纸巾。',
    when: (ctx) => ctx.mbtiType === 'INFJ' && ctx.percents.J >= 75,
  },
  {
    mbtiPrefix: 'ENFP',
    title: '流动的盛宴·人形种草机',
    subtitle:
      '你不是在旅行，你是在给地球注入活力。街边的流浪狗、酒馆的酒保都能瞬间变成你失散多年的异国挚友。',
    when: (ctx) => ctx.mbtiType === 'ENFP' && ctx.scores.financial_flexibility >= 2,
  },
  {
    mbtiPrefix: 'ENFJ',
    title: '篝火晚会的精神领袖',
    subtitle:
      '团队里的绝对黏合剂。有你在的地方永远不会冷场，你甚至能把一个完全自闭的 I 人带上舞台一起跳锅庄。',
    when: (ctx) => ctx.mbtiType === 'ENFJ' && ctx.scores.social_drive >= 2,
  },
  {
    mbtiPrefix: 'ISTP',
    title: '荒野生存的孤狼机械师',
    subtitle:
      '话极少，手极稳。在新疆爆胎能自己换，在无人区迷路能看北极星。只要给你足够的食物，你就能征服任何硬核路线。',
    when: (ctx) => ctx.mbtiType === 'ISTP' && ctx.scores.ambiguity_tolerance >= 2,
  },
  {
    mbtiPrefix: 'ISFP',
    title: '落日收集者的私人美术馆',
    subtitle:
      '对宏大叙事无感，但对光影、色彩极度挑剔。为了等西藏阿里的一场粉色日落，你可以端着相机保持一个姿势两小时。',
    when: (ctx) => ctx.mbtiType === 'ISFP' && ctx.scores.aesthetic_preference <= -1,
  },
  {
    mbtiPrefix: 'ESTP',
    title: '多巴胺超标的特种兵先锋',
    subtitle:
      '凌晨 3 点爬泰山，早上 8 点吃烧烤，下午 2 点去冲浪。你的身体里没有疲惫这个词，只有无限燃烧的卡路里。',
    when: (ctx) => ctx.mbtiType === 'ESTP' && ctx.scores.energy_capacity >= 2,
  },
  {
    mbtiPrefix: 'ESFP',
    title: '人间值得的即兴狂欢家',
    subtitle:
      '今朝有酒今朝醉。发现好玩的项目立刻就冲，预算超支了就回酒店吃泡面，你的旅行永远充满了尖叫和快乐。',
    when: (ctx) => ctx.mbtiType === 'ESFP' && ctx.scores.financial_flexibility >= 2,
  },
  {
    mbtiPrefix: 'ISTJ',
    title: '行走的国家地理活字典',
    subtitle:
      '不容许任何意外的质感旅行者。出行前必看三本纪录片，订的酒店永远在安全系数最高的街区，安全感直接拉满。',
    when: (ctx) => ctx.mbtiType === 'ISTJ' && ctx.percents.J >= 85,
  },
  {
    mbtiPrefix: 'ISFJ',
    title: '旅行团队的温柔后勤保障',
    subtitle:
      '你的背包是个百宝箱：藿香正气水、充电宝、湿纸巾、甚至还有一次性雨衣。永远默默打理好一切的无私搭子。',
    when: (ctx) => ctx.mbtiType === 'ISFJ' && ctx.scores.compromise_index >= 2,
  },
  {
    mbtiPrefix: 'ESTJ',
    title: '没有感情的打卡打桩机',
    subtitle: '「既然来了，就必须去」。你会严格监督整个团队的作息，谁要是敢赖床，会迎接你极具压迫感的敲门声。',
    when: (ctx) => ctx.mbtiType === 'ESTJ' && ctx.percents.J >= 75 && ctx.scores.planning_index >= 1,
  },
  {
    mbtiPrefix: 'ESFJ',
    title: '高级定制的合影气氛组长',
    subtitle:
      '精心协调每一个人的喜好，确保合照时每个人都在笑。你让一趟未知的旅程变得像家族聚会一样温馨有保障。',
    when: (ctx) => ctx.mbtiType === 'ESFJ' && ctx.scores.social_drive >= 2,
  },
];

export const ODYSSEY_QUADRANT_FALLBACK: Record<
  MbtiQuadrant,
  { title: string; subtitle: string }
> = {
  NT: {
    title: '理性主义的路线架构师',
    subtitle: '你用逻辑丈量世界，每一步都经过精密计算，却也在不经意间发现意外的风景。',
  },
  NF: {
    title: '理想主义的精神漫游者',
    subtitle: '你相信旅行是灵魂的对话，每一次出发都在寻找更深层的意义与连接。',
  },
  SP: {
    title: '感官探索的即时体验家',
    subtitle: '活在当下是你的信条，世界在你眼里是一幅等待触摸的画布。',
  },
  SJ: {
    title: '秩序维护的质感旅者',
    subtitle: '你让混乱的旅途变得有序而安心，是团队里那个默默撑起全局的人。',
  },
};
