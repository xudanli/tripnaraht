import { GraphNode, GraphEdge, ReasoningGraph, GraphTraversalResult, GraphQueryOptions, GraphReasoningResult } from '../interfaces/graph-reasoning.interface';
export declare class GraphReasoningService {
    private readonly logger;
    createGraph(context?: Record<string, any>): ReasoningGraph;
    addNode(graph: ReasoningGraph, node: GraphNode): void;
    addEdge(graph: ReasoningGraph, edge: GraphEdge): void;
    private updateRootAndLeafNodes;
    queryNodes(graph: ReasoningGraph, options?: GraphQueryOptions): GraphNode[];
    queryEdges(graph: ReasoningGraph, options?: GraphQueryOptions): GraphEdge[];
    traverseGraph(graph: ReasoningGraph, startNodeId: string, options?: GraphQueryOptions): GraphTraversalResult[];
    private getEdgesForPath;
    reason(graph: ReasoningGraph, startNodeIds?: string[], options?: GraphQueryOptions): Promise<GraphReasoningResult>;
    private generateExplanation;
    findPaths(graph: ReasoningGraph, fromNodeId: string, toNodeId: string, options?: GraphQueryOptions): GraphTraversalResult[];
    getNeighbors(graph: ReasoningGraph, nodeId: string, direction?: 'incoming' | 'outgoing' | 'both'): GraphNode[];
}
