// src/agent/reasoning/services/causal-modeling.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  CausalRelation,
  CausalRelationType,
  CausalStrength,
  CausalChain,
  CausalReasoningResult,
  CausalReasoningOptions,
} from '../interfaces/causal-modeling.interface';
import {
  ReasoningGraph,
  GraphNode,
  GraphEdge,
  EdgeType,
} from '../interfaces/graph-reasoning.interface';
import { GraphReasoningService } from './graph-reasoning.service';

/**
 * 因果建模服务
 * 
 * 实现文档要求的因果建模（推理层）：
 * - 在图结构基础上进行因果推理
 * - 识别因果关系
 * - 推导判断结论
 */
@Injectable()
export class CausalModelingService {
  private readonly logger = new Logger(CausalModelingService.name);

  constructor(private readonly graphReasoningService: GraphReasoningService) {}

  /**
   * 识别因果关系
   */
  async identifyCausalRelations(
    graph: ReasoningGraph,
    options?: CausalReasoningOptions
  ): Promise<CausalRelation[]> {
    this.logger.debug(`Identifying causal relations in graph with ${graph.nodes.size} nodes`);

    const relations: CausalRelation[] = [];

    // 遍历所有推导边，识别因果关系
    const derivationEdges = Array.from(graph.edges.values())
      .filter(edge => edge.type === 'DERIVATION');

    for (const edge of derivationEdges) {
      const causeNode = graph.nodes.get(edge.from);
      const effectNode = graph.nodes.get(edge.to);

      if (!causeNode || !effectNode) {
        continue;
      }

      // 确定因果关系类型
      const relationType = this.determineCausalRelationType(causeNode, effectNode, edge);

      // 确定因果关系强度
      const strength = this.determineCausalStrength(edge, causeNode, effectNode);

      // 计算置信度
      const confidence = this.calculateCausalConfidence(edge, causeNode, effectNode);

      // 过滤低置信度或低强度的关系
      if (options?.minConfidence && confidence < options.minConfidence) {
        continue;
      }

      if (options?.minStrength && 
          this.compareStrength(strength, options.minStrength) < 0) {
        continue;
      }

      // 查找相关证据
      const evidence = this.findRelatedEvidence(graph, edge.from, edge.to);

      const relation: CausalRelation = {
        id: `causal_${edge.id}`,
        cause: edge.from,
        effect: edge.to,
        type: relationType,
        strength,
        confidence,
        evidence: evidence.map(n => n.id),
        explanation: this.generateCausalExplanation(causeNode, effectNode, relationType, strength),
        metadata: {
          correlation: edge.weight || 0.5,
          temporalOrder: this.determineTemporalOrder(causeNode, effectNode),
          mechanism: edge.metadata?.reasoning,
        },
      };

      relations.push(relation);
    }

    return relations;
  }

  /**
   * 构建因果链
   */
  async buildCausalChains(
    graph: ReasoningGraph,
    relations: CausalRelation[],
    options?: CausalReasoningOptions
  ): Promise<CausalChain[]> {
    this.logger.debug(`Building causal chains from ${relations.length} relations`);

    const chains: CausalChain[] = [];
    const maxLength = options?.maxChainLength || 5;

    // 找出所有根原因（没有入边的原因节点）
    const rootCauses = relations
      .filter(r => !relations.some(other => other.effect === r.cause))
      .map(r => r.cause);

    // 从每个根原因开始构建因果链
    for (const rootCause of rootCauses) {
      const chainsFromRoot = this.buildChainsFromNode(
        graph,
        relations,
        rootCause,
        maxLength,
        options
      );
      chains.push(...chainsFromRoot);
    }

    return chains;
  }

  /**
   * 从节点构建因果链
   */
  private buildChainsFromNode(
    graph: ReasoningGraph,
    relations: CausalRelation[],
    startNodeId: string,
    maxLength: number,
    options?: CausalReasoningOptions
  ): CausalChain[] {
    const chains: CausalChain[] = [];

    const buildChain = (
      currentNodeId: string,
      currentChain: string[],
      currentRelations: CausalRelation[],
      depth: number
    ): void => {
      if (depth >= maxLength) {
        return;
      }

      if (currentChain.includes(currentNodeId)) {
        // 检测到循环，停止
        return;
      }

      const newChain = [...currentChain, currentNodeId];

      // 找出以当前节点为原因的关系
      const outgoingRelations = relations.filter(r => r.cause === currentNodeId);

      if (outgoingRelations.length === 0) {
        // 到达链的末端，保存链
        if (newChain.length > 1) {
          const chainStrength = this.calculateChainStrength(currentRelations);
          const chainConfidence = this.calculateChainConfidence(currentRelations);

          if (options?.minConfidence && chainConfidence < options.minConfidence) {
            return;
          }

          if (options?.minStrength && 
              this.compareStrength(chainStrength, options.minStrength) < 0) {
            return;
          }

          chains.push({
            id: `chain_${chains.length}_${Date.now()}`,
            nodes: newChain,
            relations: currentRelations,
            strength: chainStrength,
            confidence: chainConfidence,
            explanation: this.generateChainExplanation(graph, newChain, currentRelations),
          });
        }
        return;
      }

      // 递归处理每个结果节点
      for (const relation of outgoingRelations) {
        buildChain(
          relation.effect,
          newChain,
          [...currentRelations, relation],
          depth + 1
        );
      }
    };

    buildChain(startNodeId, [], [], 0);

    return chains;
  }

  /**
   * 执行因果推理
   */
  async reason(
    graph: ReasoningGraph,
    targetNodeId?: string,
    options?: CausalReasoningOptions
  ): Promise<CausalReasoningResult> {
    this.logger.debug(`Executing causal reasoning${targetNodeId ? ` for node ${targetNodeId}` : ''}`);

    // 识别因果关系
    const causalRelations = await this.identifyCausalRelations(graph, options);

    // 构建因果链
    const causalChains = await this.buildCausalChains(graph, causalRelations, options);

    // 找出根本原因（没有入边的节点）
    const rootCauses = this.findRootCauses(graph, causalRelations);

    // 找出结果节点（没有出边的节点，或目标节点）
    const effects = targetNodeId
      ? [graph.nodes.get(targetNodeId)].filter(Boolean) as GraphNode[]
      : this.findEffects(graph, causalRelations);

    // 计算总体置信度
    const overallConfidence = causalChains.length > 0
      ? causalChains.reduce((sum, chain) => sum + chain.confidence, 0) / causalChains.length
      : causalRelations.length > 0
      ? causalRelations.reduce((sum, rel) => sum + rel.confidence, 0) / causalRelations.length
      : 0.5;

    // 生成推理解释
    const explanation = this.generateReasoningExplanation(
      rootCauses,
      effects,
      causalChains,
      causalRelations
    );

    return {
      graph,
      causalRelations,
      causalChains,
      rootCauses,
      effects,
      overallConfidence,
      explanation,
    };
  }

  // 辅助方法

  private determineCausalRelationType(
    causeNode: GraphNode,
    effectNode: GraphNode,
    edge: GraphEdge
  ): CausalRelationType {
    // 简化实现：根据节点类型和边权重判断
    if (edge.weight && edge.weight > 0.8) {
      return 'DIRECT_CAUSE';
    } else if (edge.weight && edge.weight > 0.5) {
      return 'INDIRECT_CAUSE';
    } else {
      return 'CONTRIBUTING_FACTOR';
    }
  }

  private determineCausalStrength(
    edge: GraphEdge,
    causeNode: GraphNode,
    effectNode: GraphNode
  ): CausalStrength {
    const weight = edge.weight || 0.5;
    const causeConfidence = causeNode.metadata?.confidence || 0.5;
    const effectConfidence = effectNode.metadata?.confidence || 0.5;
    const combined = weight * causeConfidence * effectConfidence;

    if (combined > 0.8) return 'VERY_STRONG';
    if (combined > 0.6) return 'STRONG';
    if (combined > 0.4) return 'MODERATE';
    return 'WEAK';
  }

  private calculateCausalConfidence(
    edge: GraphEdge,
    causeNode: GraphNode,
    effectNode: GraphNode
  ): number {
    const edgeConfidence = edge.metadata?.confidence || 0.5;
    const causeConfidence = causeNode.metadata?.confidence || 0.5;
    const effectConfidence = effectNode.metadata?.confidence || 0.5;

    return (edgeConfidence + causeConfidence + effectConfidence) / 3;
  }

  private compareStrength(a: CausalStrength, b: CausalStrength): number {
    const strengthOrder: CausalStrength[] = ['WEAK', 'MODERATE', 'STRONG', 'VERY_STRONG'];
    return strengthOrder.indexOf(a) - strengthOrder.indexOf(b);
  }

  private findRelatedEvidence(
    graph: ReasoningGraph,
    causeId: string,
    effectId: string
  ): GraphNode[] {
    const evidence: GraphNode[] = [];

    // 查找连接到原因或结果的证据节点
    for (const edge of graph.edges.values()) {
      if (edge.type === 'DATA_SOURCE') {
        if (edge.to === causeId || edge.to === effectId) {
          const evidenceNode = graph.nodes.get(edge.from);
          if (evidenceNode && evidenceNode.type === 'EVIDENCE') {
            evidence.push(evidenceNode);
          }
        }
      }
    }

    return evidence;
  }

  private determineTemporalOrder(
    causeNode: GraphNode,
    effectNode: GraphNode
  ): 'BEFORE' | 'SIMULTANEOUS' | 'AFTER' {
    // 简化实现：通常原因是先发生的
    return 'BEFORE';
  }

  private calculateChainStrength(relations: CausalRelation[]): CausalStrength {
    if (relations.length === 0) return 'WEAK';

    const strengths = relations.map(r => r.strength);
    const strengthValues = strengths.map(s => {
      switch (s) {
        case 'VERY_STRONG': return 4;
        case 'STRONG': return 3;
        case 'MODERATE': return 2;
        case 'WEAK': return 1;
      }
    });

    const avgStrength = strengthValues.reduce((sum, v) => sum + v, 0) / strengthValues.length;

    if (avgStrength >= 3.5) return 'VERY_STRONG';
    if (avgStrength >= 2.5) return 'STRONG';
    if (avgStrength >= 1.5) return 'MODERATE';
    return 'WEAK';
  }

  private calculateChainConfidence(relations: CausalRelation[]): number {
    if (relations.length === 0) return 0;

    const confidences = relations.map(r => r.confidence);
    return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  }

  private findRootCauses(
    graph: ReasoningGraph,
    relations: CausalRelation[]
  ): GraphNode[] {
    const causeIds = new Set(relations.map(r => r.cause));
    const effectIds = new Set(relations.map(r => r.effect));

    const rootCauseIds = Array.from(causeIds).filter(id => !effectIds.has(id));

    return rootCauseIds
      .map(id => graph.nodes.get(id))
      .filter(Boolean) as GraphNode[];
  }

  private findEffects(
    graph: ReasoningGraph,
    relations: CausalRelation[]
  ): GraphNode[] {
    const causeIds = new Set(relations.map(r => r.cause));
    const effectIds = new Set(relations.map(r => r.effect));

    const finalEffectIds = Array.from(effectIds).filter(id => !causeIds.has(id));

    return finalEffectIds
      .map(id => graph.nodes.get(id))
      .filter(Boolean) as GraphNode[];
  }

  private generateCausalExplanation(
    causeNode: GraphNode,
    effectNode: GraphNode,
    type: CausalRelationType,
    strength: CausalStrength
  ): string {
    const typeMap: Record<CausalRelationType, string> = {
      DIRECT_CAUSE: '直接导致',
      INDIRECT_CAUSE: '间接影响',
      CONTRIBUTING_FACTOR: '贡献因素',
      CONFOUNDING_FACTOR: '混淆因素',
    };

    return `${causeNode.label} ${typeMap[type]} ${effectNode.label}（${strength}）`;
  }

  private generateChainExplanation(
    graph: ReasoningGraph,
    nodeIds: string[],
    relations: CausalRelation[]
  ): string {
    const nodeLabels = nodeIds.map(id => graph.nodes.get(id)?.label || id);
    return `因果链：${nodeLabels.join(' → ')}`;
  }

  private generateReasoningExplanation(
    rootCauses: GraphNode[],
    effects: GraphNode[],
    chains: CausalChain[],
    relations: CausalRelation[]
  ): string {
    const parts: string[] = [];

    if (rootCauses.length > 0) {
      parts.push(`识别出 ${rootCauses.length} 个根本原因`);
    }

    if (effects.length > 0) {
      parts.push(`${effects.length} 个结果`);
    }

    if (chains.length > 0) {
      parts.push(`构建了 ${chains.length} 条因果链`);
    }

    if (relations.length > 0) {
      parts.push(`识别了 ${relations.length} 个因果关系`);
    }

    return parts.join('，') || '因果推理完成';
  }
}
