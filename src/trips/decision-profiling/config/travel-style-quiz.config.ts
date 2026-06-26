import type { DecisionStyleType } from '../types/decision-profiling.types';
import type { QuizQuestion } from '../types/decision-profiling.types';

export const DECISION_STYLE_LABELS: Record<DecisionStyleType, string> = {
  RATIONAL_EXPLORER: '理性探索者',
  EXPERIENCE_SEEKER: '体验追求者',
  HARMONY_COORDINATOR: '和谐协调者',
  SPONTANEOUS_ADVENTURER: '即兴冒险家',
  PRAGMATIC_PLANNER: '务实规划者',
  FLEXIBLE_OPTIMIZER: '灵活优化者',
};

export const DECISION_STYLE_META: Record<
  DecisionStyleType,
  { coreDrivers: string[]; teamRole: string; compatibilityHints: string[] }
> = {
  RATIONAL_EXPLORER: {
    coreDrivers: ['数据与信息', '性价比', '可验证的体验'],
    teamRole: '信息整合者 — 擅长把选项摊开对比',
    compatibilityHints: ['与务实规划者配合顺畅', '与即兴冒险家需在变更前对齐信息'],
  },
  EXPERIENCE_SEEKER: {
    coreDrivers: ['独特体验', '情绪峰值', '值得的故事'],
    teamRole: '体验推手 — 善于发现「不要错过」的时刻',
    compatibilityHints: ['与灵活优化者易达成共识', '与预算敏感者需提前划定体验预算'],
  },
  HARMONY_COORDINATOR: {
    coreDrivers: ['团队氛围', '共同决策', '关系维护'],
    teamRole: '协调者 — 倾向先听大家再拍板',
    compatibilityHints: ['适合担任住宿/餐饮协商主持', '决策慢时需有人帮忙收敛选项'],
  },
  SPONTANEOUS_ADVENTURER: {
    coreDrivers: ['当下机会', '冒险感', '即兴惊喜'],
    teamRole: '机会捕捉者 — 对突发好运反应最快',
    compatibilityHints: ['与体验追求者共鸣高', '与务实规划者需约定「可改动窗口」'],
  },
  PRAGMATIC_PLANNER: {
    coreDrivers: ['计划稳定', '预订保障', '风险可控'],
    teamRole: '执行锚点 — 守住已确认的安排',
    compatibilityHints: ['适合主导大交通与预订节点', '变更频繁时容易感到压力'],
  },
  FLEXIBLE_OPTIMIZER: {
    coreDrivers: ['多方案并行', '折中优化', '资源最大化'],
    teamRole: '方案设计师 — 擅长「两个都要」',
    compatibilityHints: ['与多数风格兼容', '选项过多时需团队限时收敛'],
  },
};

export const TRAVEL_STYLE_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'ts_q1',
    section: 'travel_style',
    prompt: '你在冰岛的第3天，原定去冰川徒步，但天气预报说有70%概率看到北极光。你会：',
    options: [
      { id: 'a', label: '坚持原计划（冰川徒步已经预订了）', scores: { PRAGMATIC_PLANNER: 3, RATIONAL_EXPLORER: 1 } },
      { id: 'b', label: '立刻改为追极光（机会难得）', scores: { SPONTANEOUS_ADVENTURER: 3, EXPERIENCE_SEEKER: 2 } },
      { id: 'c', label: '查一下能否两个都安排', scores: { FLEXIBLE_OPTIMIZER: 3, RATIONAL_EXPLORER: 2 } },
      { id: 'd', label: '问问大家的想法再决定', scores: { HARMONY_COORDINATOR: 3 } },
    ],
  },
  {
    id: 'ts_q2',
    section: 'travel_style',
    prompt: '行程中突然出现一家本地人才知道的隐藏餐厅，但会耽误接下来1小时。你会：',
    options: [
      { id: 'a', label: '按原计划走，下次再来', scores: { PRAGMATIC_PLANNER: 2, RATIONAL_EXPLORER: 1 } },
      { id: 'b', label: '立刻改道去试', scores: { SPONTANEOUS_ADVENTURER: 3, EXPERIENCE_SEEKER: 2 } },
      { id: 'c', label: '快速查评价和排队时间再决定', scores: { RATIONAL_EXPLORER: 3, FLEXIBLE_OPTIMIZER: 1 } },
      { id: 'd', label: '投票或问问同伴意愿', scores: { HARMONY_COORDINATOR: 3 } },
    ],
  },
  {
    id: 'ts_q3',
    section: 'travel_style',
    prompt: '规划一天行程时，你更倾向：',
    options: [
      { id: 'a', label: '时间块排满，减少空档', scores: { PRAGMATIC_PLANNER: 2, RATIONAL_EXPLORER: 2 } },
      { id: 'b', label: '留足空白，随时插入惊喜', scores: { SPONTANEOUS_ADVENTURER: 3, EXPERIENCE_SEEKER: 1 } },
      { id: 'c', label: '核心景点固定，其余弹性', scores: { FLEXIBLE_OPTIMIZER: 3 } },
      { id: 'd', label: '先对齐团队节奏再定', scores: { HARMONY_COORDINATOR: 3 } },
    ],
  },
  {
    id: 'ts_q4',
    section: 'travel_style',
    prompt: '遇到天气导致某景点关闭，你第一反应是：',
    options: [
      { id: 'a', label: '查备选方案并对比性价比', scores: { RATIONAL_EXPLORER: 3, FLEXIBLE_OPTIMIZER: 1 } },
      { id: 'b', label: '找一个同样震撼的替代体验', scores: { EXPERIENCE_SEEKER: 3, SPONTANEOUS_ADVENTURER: 1 } },
      { id: 'c', label: '按备份 Plan B 执行', scores: { PRAGMATIC_PLANNER: 3 } },
      { id: 'd', label: '召集大家讨论今天怎么过', scores: { HARMONY_COORDINATOR: 3 } },
    ],
  },
  {
    id: 'ts_q5',
    section: 'travel_style',
    prompt: '关于「要不要早起看日出」，你通常：',
    options: [
      { id: 'a', label: '值得就去，不看会遗憾', scores: { EXPERIENCE_SEEKER: 3, SPONTANEOUS_ADVENTURER: 1 } },
      { id: 'b', label: '评估睡眠成本后再说', scores: { RATIONAL_EXPLORER: 3, PRAGMATIC_PLANNER: 1 } },
      { id: 'c', label: '少数人去即可，其他人休息', scores: { FLEXIBLE_OPTIMIZER: 3, HARMONY_COORDINATOR: 1 } },
      { id: 'd', label: '跟大家统一行动', scores: { HARMONY_COORDINATOR: 3, PRAGMATIC_PLANNER: 1 } },
    ],
  },
];
