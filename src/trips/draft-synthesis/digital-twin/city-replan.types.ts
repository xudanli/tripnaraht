/**
 * 城市级重规划触发（非单用户 patch）：事件驱动全局再分配入口。
 */
export type CityReplanTriggerKind =
  | 'MAJOR_EVENT'
  | 'TRANSPORT_COLLAPSE'
  | 'GLOBAL_POI_OVERLOAD'
  | 'WEATHER_SEVERE';

export interface CityReplanTrigger {
  kind: CityReplanTriggerKind;
  timestamp: number;
  cityId: string;
  payload: Record<string, unknown>;
}

export interface CityReplanProposal {
  trigger: CityReplanTrigger;
  /** 占位：全局策略版本号 / 批次 id */
  batchId: string;
  affectedTripHints: string[];
  note: string;
}
