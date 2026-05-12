/**
 * Phase 4：DecisionFactor DSL → 可执行指令（非 hint）。
 * v1 仅定义 ROUTE_DEGRADE（WEATHER + DEGRADE_ROUTE）；后续扩展 REROUTE / BLOCK 等。
 */

export type DecisionExecutableActionType = 'ROUTE_DEGRADE';

export interface DecisionExecutableRouteDegradePayload {
  kind: 'WEATHER_WIND';
  countryCode?: string;
  routeDirectionId?: string;
  assert?: string;
}

export interface DecisionExecutableAction {
  actionType: DecisionExecutableActionType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  /** 是否可在业务层安全撤销（策略由调用方实现） */
  reversible: boolean;
  rollbackHint: string;
  sourceFactorIds: string[];
  payload: DecisionExecutableRouteDegradePayload;
}
