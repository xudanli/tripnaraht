/** Consumer 探索 — 租车保险档位（用户声明 / 条件页） */

export const EXPLORATION_INSURANCE_TIERS = [
  {
    code: 'BASIC',
    label: '基础 CDW',
    description: '仅碰撞险，不含碎石 / 涉水 / 底盘专项',
  },
  {
    code: 'STANDARD',
    label: '标准套餐',
    description: '碰撞 + 碎石（GP），涉水 / 底盘未确认',
  },
  {
    code: 'FULL',
    label: '全险 / 零起赔',
    description: '碰撞、碎石、底盘等声明覆盖；涉水过河损坏通常不在普通保险范围内',
  },
  {
    code: 'UNKNOWN',
    label: '尚未确认',
    description: '尚未选择或核对保单，系统按缺失证据处理',
  },
] as const;

export type ExplorationInsuranceCoverageTier =
  (typeof EXPLORATION_INSURANCE_TIERS)[number]['code'];

export function isExplorationInsuranceCoverageTier(
  value: string,
): value is ExplorationInsuranceCoverageTier {
  return EXPLORATION_INSURANCE_TIERS.some((t) => t.code === value);
}
