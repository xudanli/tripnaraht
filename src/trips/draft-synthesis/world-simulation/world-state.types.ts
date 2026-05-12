/**
 * 可运行世界快照：与静态 itinerary 相对，用于事件驱动局部重规划。
 */
export interface WorldState {
  /** 世界时间轴（epoch ms，或产品约定单调时钟） */
  time: number;

  /** 区域/日期键 → 天气（键可为 regionId、date YYYY-MM-DD 等） */
  weather: Record<string, 'sunny' | 'rain' | 'storm'>;

  /** placeId → 营业/拥挤门禁 */
  poiStatus: Record<number, 'open' | 'closed' | 'crowded'>;

  /** 线路/方式 id → 通行状态 */
  transportStatus: Record<string, 'normal' | 'delayed' | 'blocked'>;

  /** placeId → 相对拥挤度 0–1 */
  crowdLevel: Record<number, number>;

  userState: {
    fatigue: number;
    mood: number;
    flexibility: number;
  };
}
