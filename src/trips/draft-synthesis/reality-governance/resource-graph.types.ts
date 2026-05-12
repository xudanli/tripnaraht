/**
 * 全局资源图（城市级基础设施占位）：节点 + 占用/依赖/冲突边。
 */
export type ResourceGraphNodeKind = 'POI' | 'RESTAURANT' | 'TRANSPORT' | 'USER';

export interface ResourceGraphNode {
  id: string;
  kind: ResourceGraphNodeKind;
  label?: string;
}

export type ResourceGraphRelation = 'occupancy' | 'dependency' | 'conflict';

export interface ResourceGraphEdge {
  fromId: string;
  toId: string;
  relation: ResourceGraphRelation;
  weight?: number;
}

export interface ResourceGraph {
  nodes: ResourceGraphNode[];
  edges: ResourceGraphEdge[];
}
