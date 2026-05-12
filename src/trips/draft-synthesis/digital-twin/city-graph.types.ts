/**
 * 城市道路网络最小图结构（可替换为 GIS / Map Provider 拓扑）。
 */
export interface RoadEdge {
  from: string;
  to: string;
  km?: number;
  roadClass?: string;
}

export interface RoadGraph {
  nodeIds: string[];
  edges: RoadEdge[];
}
