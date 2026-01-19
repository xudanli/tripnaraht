// src/agent/reasoning/interfaces/graph-reasoning.interface.ts

/**
 * 节点类型
 */
export type NodeType = 
  | 'ROUTE'           // 路线节点
  | 'USER'            // 用户节点
  | 'ENVIRONMENT'     // 环境节点
  | 'FEATURE'         // 特征节点
  | 'JUDGMENT'        // 判断节点
  | 'EVIDENCE';       // 证据节点

/**
 * 边类型
 */
export type EdgeType = 
  | 'CONSTRAINT'      // 约束边（如时间约束、空间约束）
  | 'DERIVATION'      // 推导边（如从特征推导判断）
  | 'DATA_SOURCE';    // 数据来源边（如证据来源）

/**
 * 图节点
 */
export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  data: Record<string, any>;  // 节点数据
  metadata?: {
    confidence?: number;      // 置信度（0-1）
    source?: string;          // 数据来源
    timestamp?: string;       // 时间戳
  };
}

/**
 * 图边
 */
export interface GraphEdge {
  id: string;
  type: EdgeType;
  from: string;       // 源节点ID
  to: string;         // 目标节点ID
  weight?: number;    // 权重（0-1）
  label?: string;     // 边标签
  data?: Record<string, any>;  // 边数据
  metadata?: {
    confidence?: number;      // 置信度（0-1）
    reasoning?: string;       // 推理说明
  };
}

/**
 * 推理图
 */
export interface ReasoningGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  rootNodes: string[];  // 根节点ID列表
  leafNodes: string[]; // 叶子节点ID列表
  metadata?: {
    createdAt: string;
    updatedAt: string;
    context?: Record<string, any>;
  };
}

/**
 * 图遍历结果
 */
export interface GraphTraversalResult {
  path: string[];           // 节点ID路径
  nodes: GraphNode[];      // 路径上的节点
  edges: GraphEdge[];      // 路径上的边
  totalWeight: number;     // 路径总权重
  confidence: number;      // 路径置信度
}

/**
 * 图查询选项
 */
export interface GraphQueryOptions {
  startNodeId?: string;    // 起始节点ID
  endNodeId?: string;       // 结束节点ID
  nodeTypes?: NodeType[];   // 节点类型过滤
  edgeTypes?: EdgeType[];   // 边类型过滤
  maxDepth?: number;        // 最大深度
  minConfidence?: number;   // 最小置信度
}

/**
 * 图推理结果
 */
export interface GraphReasoningResult {
  graph: ReasoningGraph;
  reasoningPath: GraphTraversalResult[];  // 推理路径
  conclusions: GraphNode[];               // 结论节点
  evidence: GraphNode[];                   // 证据节点
  confidence: number;                      // 总体置信度
  explanation: string;                     // 推理解释
}
