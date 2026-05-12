/**
 * 系统级「全球/城市」世界快照：多用户调度与资源竞争用的粗粒度状态（与单行程 WorldState 互补）。
 */
export interface CityWorldSlice {
  /** 0–1 区域拥堵/拥挤信号 */
  congestion: number;
  /** 天气标签（与预报服务对齐的字符串即可） */
  weather: string;
  /** 0–1 突发扰动（事故/管制/大型活动） */
  disruptionLevel: number;
}

export interface PoiNetworkNode {
  /** 归一化容量上界（相对单位即可） */
  capacity: number;
  /** 当前负载 0–1 */
  load: number;
  /** 0–1 风险/不确定性 */
  risk: number;
}

export interface TransportEdge {
  from: string;
  to: string;
  mode?: string;
  weight?: number;
}

export interface GlobalWorldState {
  /** 世界时钟（epoch ms） */
  time: number;

  cities: Record<string, CityWorldSlice>;

  poiNetwork: Record<number, PoiNetworkNode>;

  transportGraph: {
    edges: TransportEdge[];
    /** edge key（如 "A|B|walk"）→ 拥堵 0–1 */
    congestionMap: Record<string, number>;
  };

  /** 当前纳入全局调度的行程 id */
  activeTrips: string[];
}
