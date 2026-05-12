import type { RoadGraph } from './city-graph.types';

/** POI 孪生节点（与业务 placeId 对齐） */
export interface CityPoiTwinNode {
  id: number;
  label?: string;
  categoryHint?: string;
}

/**
 * 城市级数字孪生快照：可计算、可预测、可调度的统一状态（内存骨架）。
 */
export interface CityDigitalTwin {
  cityId: string;
  /** epoch ms */
  time: number;

  mobilityLayer: {
    roads: RoadGraph;
    /** edgeKey（如 from|to）→ 拥堵 0–1 */
    congestion: Record<string, number>;
  };

  poiLayer: {
    nodes: CityPoiTwinNode[];
    /** placeId → 静态容量上界（相对单位） */
    capacity: Record<number, number>;
    /** placeId → 实时队列/负载估计 0–1 */
    liveQueue: Record<number, number>;
  };

  demandLayer: {
    /** 粗粒度活跃出行需求强度 */
    userFlows: number;
    /** 区域键 → 行程密度（相对） */
    tripDensity: Record<string, number>;
  };

  disruptionLayer: {
    weather: Record<string, unknown>;
    events: unknown[];
  };
}
