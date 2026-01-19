// src/agent/reasoning/services/graph-reasoning.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  NodeType,
  EdgeType,
  GraphNode,
  GraphEdge,
  ReasoningGraph,
  GraphTraversalResult,
  GraphQueryOptions,
  GraphReasoningResult,
} from '../interfaces/graph-reasoning.interface';

/**
 * 图推理服务
 * 
 * 实现文档要求的图推理系统（结构层）：
 * - 定义节点类型（路线、用户、环境、特征、判断、证据）
 * - 定义边类型（约束边、推导边、数据来源边）
 * - 实现图结构的构建和遍历
 */
@Injectable()
export class GraphReasoningService {
  private readonly logger = new Logger(GraphReasoningService.name);

  /**
   * 创建推理图
   */
  createGraph(context?: Record<string, any>): ReasoningGraph {
    const graph: ReasoningGraph = {
      nodes: new Map(),
      edges: new Map(),
      rootNodes: [],
      leafNodes: [],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        context,
      },
    };

    return graph;
  }

  /**
   * 添加节点
   */
  addNode(
    graph: ReasoningGraph,
    node: GraphNode
  ): void {
    graph.nodes.set(node.id, node);
    this.updateRootAndLeafNodes(graph);
  }

  /**
   * 添加边
   */
  addEdge(
    graph: ReasoningGraph,
    edge: GraphEdge
  ): void {
    // 验证节点存在
    if (!graph.nodes.has(edge.from)) {
      throw new Error(`Source node ${edge.from} not found`);
    }
    if (!graph.nodes.has(edge.to)) {
      throw new Error(`Target node ${edge.to} not found`);
    }

    graph.edges.set(edge.id, edge);
    this.updateRootAndLeafNodes(graph);
  }

  /**
   * 更新根节点和叶子节点
   */
  private updateRootAndLeafNodes(graph: ReasoningGraph): void {
    const nodeIds = Array.from(graph.nodes.keys());
    const hasIncoming = new Set<string>();
    const hasOutgoing = new Set<string>();

    // 找出有入边和出边的节点
    for (const edge of graph.edges.values()) {
      hasIncoming.add(edge.to);
      hasOutgoing.add(edge.from);
    }

    // 根节点：没有入边的节点
    graph.rootNodes = nodeIds.filter(id => !hasIncoming.has(id));

    // 叶子节点：没有出边的节点
    graph.leafNodes = nodeIds.filter(id => !hasOutgoing.has(id));
  }

  /**
   * 查询节点
   */
  queryNodes(
    graph: ReasoningGraph,
    options?: GraphQueryOptions
  ): GraphNode[] {
    let nodes = Array.from(graph.nodes.values());

    // 按节点类型过滤
    if (options?.nodeTypes && options.nodeTypes.length > 0) {
      nodes = nodes.filter(node => options.nodeTypes!.includes(node.type));
    }

    // 按置信度过滤
    if (options?.minConfidence !== undefined) {
      nodes = nodes.filter(node => 
        (node.metadata?.confidence || 1.0) >= options.minConfidence!
      );
    }

    return nodes;
  }

  /**
   * 查询边
   */
  queryEdges(
    graph: ReasoningGraph,
    options?: GraphQueryOptions
  ): GraphEdge[] {
    let edges = Array.from(graph.edges.values());

    // 按边类型过滤
    if (options?.edgeTypes && options.edgeTypes.length > 0) {
      edges = edges.filter(edge => options.edgeTypes!.includes(edge.type));
    }

    // 按起始节点过滤
    if (options?.startNodeId) {
      edges = edges.filter(edge => edge.from === options.startNodeId);
    }

    // 按结束节点过滤
    if (options?.endNodeId) {
      edges = edges.filter(edge => edge.to === options.endNodeId);
    }

    return edges;
  }

  /**
   * 遍历图（深度优先搜索）
   */
  traverseGraph(
    graph: ReasoningGraph,
    startNodeId: string,
    options?: GraphQueryOptions
  ): GraphTraversalResult[] {
    const results: GraphTraversalResult[] = [];
    const visited = new Set<string>();
    const maxDepth = options?.maxDepth || 10;

    const dfs = (
      currentNodeId: string,
      path: string[],
      currentWeight: number,
      currentConfidence: number,
      depth: number
    ): void => {
      if (depth > maxDepth) {
        return;
      }

      if (visited.has(currentNodeId)) {
        return;
      }

      const node = graph.nodes.get(currentNodeId);
      if (!node) {
        return;
      }

      // 检查置信度
      const nodeConfidence = node.metadata?.confidence || 1.0;
      const minConfidence = options?.minConfidence || 0;
      if (nodeConfidence < minConfidence) {
        return;
      }

      const newPath = [...path, currentNodeId];
      const newConfidence = currentConfidence * nodeConfidence;

      // 如果是叶子节点或达到目标节点，记录路径
      if (graph.leafNodes.includes(currentNodeId) || 
          (options?.endNodeId && currentNodeId === options.endNodeId)) {
        const pathNodes = newPath.map(id => graph.nodes.get(id)!).filter(Boolean);
        const pathEdges = this.getEdgesForPath(graph, newPath);

        results.push({
          path: newPath,
          nodes: pathNodes,
          edges: pathEdges,
          totalWeight: currentWeight,
          confidence: newConfidence,
        });
        return;
      }

      visited.add(currentNodeId);

      // 遍历出边
      const outgoingEdges = Array.from(graph.edges.values())
        .filter(edge => edge.from === currentNodeId);

      for (const edge of outgoingEdges) {
        // 检查边类型过滤
        if (options?.edgeTypes && 
            options.edgeTypes.length > 0 && 
            !options.edgeTypes.includes(edge.type)) {
          continue;
        }

        const edgeWeight = edge.weight || 1.0;
        const edgeConfidence = edge.metadata?.confidence || 1.0;

        dfs(
          edge.to,
          newPath,
          currentWeight + edgeWeight,
          newConfidence * edgeConfidence,
          depth + 1
        );
      }

      visited.delete(currentNodeId);
    };

    dfs(startNodeId, [], 0, 1.0, 0);

    return results;
  }

  /**
   * 获取路径上的边
   */
  private getEdgesForPath(
    graph: ReasoningGraph,
    path: string[]
  ): GraphEdge[] {
    const edges: GraphEdge[] = [];

    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];

      const edge = Array.from(graph.edges.values())
        .find(e => e.from === from && e.to === to);

      if (edge) {
        edges.push(edge);
      }
    }

    return edges;
  }

  /**
   * 执行图推理
   */
  async reason(
    graph: ReasoningGraph,
    startNodeIds?: string[],
    options?: GraphQueryOptions
  ): Promise<GraphReasoningResult> {
    this.logger.debug(`Executing graph reasoning with ${graph.nodes.size} nodes and ${graph.edges.size} edges`);

    // 确定起始节点
    const startNodes = startNodeIds || graph.rootNodes;
    if (startNodes.length === 0) {
      throw new Error('No start nodes specified and no root nodes found');
    }

    // 遍历所有起始节点
    const allPaths: GraphTraversalResult[] = [];
    for (const startNodeId of startNodes) {
      const paths = this.traverseGraph(graph, startNodeId, options);
      allPaths.push(...paths);
    }

    // 找出结论节点（通常是判断节点）
    const conclusionNodes = this.queryNodes(graph, {
      nodeTypes: ['JUDGMENT'],
      minConfidence: options?.minConfidence,
    });

    // 找出证据节点
    const evidenceNodes = this.queryNodes(graph, {
      nodeTypes: ['EVIDENCE'],
      minConfidence: options?.minConfidence,
    });

    // 计算总体置信度（取最高置信度的路径）
    const maxConfidence = allPaths.length > 0
      ? Math.max(...allPaths.map(p => p.confidence))
      : 0.5;

    // 生成推理解释
    const explanation = this.generateExplanation(
      graph,
      allPaths,
      conclusionNodes,
      evidenceNodes
    );

    return {
      graph,
      reasoningPath: allPaths,
      conclusions: conclusionNodes,
      evidence: evidenceNodes,
      confidence: maxConfidence,
      explanation,
    };
  }

  /**
   * 生成推理解释
   */
  private generateExplanation(
    graph: ReasoningGraph,
    paths: GraphTraversalResult[],
    conclusions: GraphNode[],
    evidence: GraphNode[]
  ): string {
    const parts: string[] = [];

    if (conclusions.length > 0) {
      parts.push(`基于 ${evidence.length} 个证据节点，得出 ${conclusions.length} 个判断结论`);
    }

    if (paths.length > 0) {
      const topPath = paths.sort((a, b) => b.confidence - a.confidence)[0];
      parts.push(`主要推理路径包含 ${topPath.nodes.length} 个节点，置信度 ${(topPath.confidence * 100).toFixed(1)}%`);
    }

    return parts.join('。') || '图推理完成';
  }

  /**
   * 查找节点之间的路径
   */
  findPaths(
    graph: ReasoningGraph,
    fromNodeId: string,
    toNodeId: string,
    options?: GraphQueryOptions
  ): GraphTraversalResult[] {
    return this.traverseGraph(graph, fromNodeId, {
      ...options,
      endNodeId: toNodeId,
    });
  }

  /**
   * 获取节点的邻居节点
   */
  getNeighbors(
    graph: ReasoningGraph,
    nodeId: string,
    direction: 'incoming' | 'outgoing' | 'both' = 'both'
  ): GraphNode[] {
    const neighborIds = new Set<string>();

    if (direction === 'incoming' || direction === 'both') {
      for (const edge of graph.edges.values()) {
        if (edge.to === nodeId) {
          neighborIds.add(edge.from);
        }
      }
    }

    if (direction === 'outgoing' || direction === 'both') {
      for (const edge of graph.edges.values()) {
        if (edge.from === nodeId) {
          neighborIds.add(edge.to);
        }
      }
    }

    return Array.from(neighborIds)
      .map(id => graph.nodes.get(id))
      .filter(Boolean) as GraphNode[];
  }
}
