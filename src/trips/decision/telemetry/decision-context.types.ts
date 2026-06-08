/**
 * Decision Context Layer — 重建决策环境，支撑因果推断与回放
 */

export type ExperienceLevel = 'first_time' | 'returning' | 'expert';
export type PressureLevel = 'low' | 'medium' | 'high';
export type BudgetElasticity = 'rigid' | 'moderate' | 'flexible';

export interface DecisionWeatherContext {
  condition?: string;
  severity?: PressureLevel;
  temperature_c?: number;
  wind_m_s?: number;
  road_closure_risk?: boolean;
}

export interface DecisionGroupContext {
  adults: number;
  children?: number;
  seniors?: number;
  composition_label?: string;
}

/**
 * 决策发生时的环境切片 — 用于因果重建，不是 analytics 维度
 */
export interface DecisionContextLayer {
  capturedAt: string;
  weather?: DecisionWeatherContext;
  travelExperienceLevel?: ExperienceLevel;
  groupComposition?: DecisionGroupContext;
  timePressure?: PressureLevel;
  budgetElasticity?: BudgetElasticity;
  season?: string;
  month?: number;
  /** 目的地特定上下文（如冰岛 F-road 开放状态） */
  destinationSignals?: Record<string, unknown>;
}
