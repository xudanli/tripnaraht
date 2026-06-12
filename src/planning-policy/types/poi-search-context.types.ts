/**
 * Stateful / contextual POI 检索上下文（Phase-1 最小闭环）。
 * 字段均为可选（除 destination 外），支持 partial contextual retrieval。
 */
export interface PoiSearchContext {
  destination: string;
  tripStyle?: string[];
  selectedPoiIds?: string[];
  rejectedPoiIds?: string[];
  dayIndex?: number;
  /** 0–1，越高越疲劳（来自 TripState.fatigue 等时做归一） */
  fatigueScore?: number;
  /** 0–1，越高越倾向「少重复 / 探索」 */
  noveltyBias?: number;
  /** 用户偏好小众景点：检索与 POI_SELECTION 保证 off-beat 配额 */
  preferOffbeatAttractions?: boolean;
  weather?: {
    condition?: string;
    temperature?: number;
  };
  pacing?: 'relaxed' | 'balanced' | 'intensive';
}
