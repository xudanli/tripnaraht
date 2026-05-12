/**
 * 外部世界或用户注入的离散事件（可回放为 Reducer 输入）。
 */
export type WorldEventType =
  | 'WEATHER_CHANGE'
  | 'POI_CLOSED'
  | 'CROWD_SPIKE'
  | 'TRANSPORT_DELAY'
  | 'USER_INTERRUPT';

export interface WorldEvent {
  /** 幂等 / 观测 */
  id?: string;
  type: WorldEventType;
  timestamp: number;
  payload: Record<string, unknown>;
}
