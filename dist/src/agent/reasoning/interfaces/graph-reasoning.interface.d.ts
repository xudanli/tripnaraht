export type NodeType = 'ROUTE' | 'USER' | 'ENVIRONMENT' | 'FEATURE' | 'JUDGMENT' | 'EVIDENCE' | 'WEATHER' | 'ROAD_STATUS' | 'USER_CAPABILITY' | 'ROUTE_DIFFICULTY' | 'PREDICTION' | 'TRIP_SUCCESS' | 'TRIP_FAILURE';
export type EdgeType = 'CONSTRAINT' | 'DERIVATION' | 'DATA_SOURCE';
export interface GraphNode {
    id: string;
    type: NodeType;
    label: string;
    data: Record<string, any>;
    metadata?: {
        confidence?: number;
        source?: string;
        timestamp?: string;
        worldModelType?: string;
    };
}
export interface GraphEdge {
    id: string;
    type: EdgeType;
    from: string;
    to: string;
    weight?: number;
    label?: string;
    data?: Record<string, any>;
    metadata?: {
        confidence?: number;
        reasoning?: string;
    };
}
export interface ReasoningGraph {
    nodes: Map<string, GraphNode>;
    edges: Map<string, GraphEdge>;
    rootNodes: string[];
    leafNodes: string[];
    metadata?: {
        createdAt: string;
        updatedAt: string;
        context?: Record<string, any>;
    };
}
export interface GraphTraversalResult {
    path: string[];
    nodes: GraphNode[];
    edges: GraphEdge[];
    totalWeight: number;
    confidence: number;
}
export interface GraphQueryOptions {
    startNodeId?: string;
    endNodeId?: string;
    nodeTypes?: NodeType[];
    edgeTypes?: EdgeType[];
    maxDepth?: number;
    minConfidence?: number;
}
export interface GraphReasoningResult {
    graph: ReasoningGraph;
    reasoningPath: GraphTraversalResult[];
    conclusions: GraphNode[];
    evidence: GraphNode[];
    confidence: number;
    explanation: string;
}
