/**
 * Decision Awareness — 业务响应携带的决策因子与动作影响（系统级语言）。
 * DecisionFactor = DSL v1 最小决策原子（assert / effect / target / actionHint）。
 */

/** DSL v1：规则触发后的系统语义效果 */
export type DecisionFactorEffect = 'WARNING' | 'BLOCK' | 'SUGGEST' | 'NONE';

/** DSL v1：决策作用对象 */
export type DecisionFactorTarget =
  | 'ROUTE'
  | 'TRIP'
  | 'SEGMENT'
  | 'COUNTRY'
  | 'INVENTORY';

/** DSL v1：对 Planner / Route / Trip 的动作提示（非强制绑定） */
export type DecisionFactorActionHint =
  | 'DEGRADE_ROUTE'
  | 'REROUTE'
  | 'ADD_CAUTION'
  | 'NONE';

/** 由 DSL effect 推导旧版 UI 档位（兼容层） */
export function impactLevelFromEffect(
  effect: DecisionFactorEffect,
): 'INFO' | 'WARNING' | 'BLOCKER' {
  switch (effect) {
    case 'WARNING':
      return 'WARNING';
    case 'BLOCK':
      return 'BLOCKER';
    case 'SUGGEST':
    case 'NONE':
      return 'INFO';
    default:
      return 'INFO';
  }
}

export interface DecisionFactor {
  factorType: 'WEATHER' | 'ROAD_ACCESS' | 'SAFETY' | 'INVENTORY' | 'TIME_WINDOW';
  title: string;
  summary: string;
  /**
   * 与 {@link effect} 同步；遗留展示/筛选用。
   * 新逻辑请优先读 `effect` / `target` / `actionHint`。
   */
  impactLevel: 'INFO' | 'WARNING' | 'BLOCKER';
  derivedFromFactIds: string[];
  confidence?: number;
  /** DSL v1：事实判断（可回放、可对账） */
  assert?: string;
  /** DSL v1：决策语义效果 */
  effect: DecisionFactorEffect;
  /** DSL v1：作用对象 */
  target: DecisionFactorTarget;
  /** DSL v1：建议动作 */
  actionHint: DecisionFactorActionHint;
}

export interface DecisionImpact {
  impactType: 'ROUTE_CHANGE' | 'WARNING' | 'BLOCK' | 'SUGGESTION';
  /** 作用域标识：如 tripId、routeDirectionId、或 country 级 route 推荐会话 */
  target: string;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  derivedFromFactIds: string[];
}
