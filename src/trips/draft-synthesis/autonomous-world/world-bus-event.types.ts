/**
 * 统一世界事件总线（气象/人群/交通/用户/系统），驱动重评估与再平衡。
 */
export type WorldBusKind = 'WEATHER' | 'CROWD' | 'TRANSPORT' | 'USER' | 'SYSTEM';

export interface WorldBusEvent {
  kind: WorldBusKind;
  /** 细分子类型，如 WEATHER_CHANGE / METRO_DELAY */
  subType: string;
  timestamp: number;
  cityKey?: string;
  placeId?: number;
  payload: Record<string, unknown>;
}
