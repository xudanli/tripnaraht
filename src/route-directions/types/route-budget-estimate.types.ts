/**
 * 路线模板按天预算类型
 */

export type BudgetVehicleType = 'fuel' | 'ev' | 'hybrid' | string;

/** 单项费用：支持定点 amount 或区间 min/max */
export interface BudgetCostLine {
  amount?: number;
  min?: number;
  max?: number;
  note?: string;
}

export type BudgetCategoryKey =
  | 'tickets'
  | 'fuel'
  | 'charging'
  | 'parking'
  | 'accommodation'
  | 'other';

export const BUDGET_CATEGORY_KEYS: BudgetCategoryKey[] = [
  'tickets',
  'fuel',
  'charging',
  'parking',
  'accommodation',
  'other',
];

/** 单日预算 */
export interface DayBudgetItem {
  day: number;
  theme?: string;
  tickets?: BudgetCostLine;
  fuel?: BudgetCostLine;
  charging?: BudgetCostLine;
  parking?: BudgetCostLine;
  accommodation?: BudgetCostLine;
  other?: BudgetCostLine;
  /** 当日合计；省略时由各类别汇总 */
  dayTotal?: BudgetCostLine;
}

export type BudgetCategoryTotals = Partial<
  Record<BudgetCategoryKey, BudgetCostLine>
>;

export interface BudgetTotals {
  min?: number;
  max?: number;
  amount?: number;
  perPerson?: number;
}
