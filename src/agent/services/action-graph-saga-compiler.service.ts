import { Injectable } from '@nestjs/common';
import {
  ActionEdge,
  ActionGraph,
  ActionNode,
  ActionRiskLevel,
  EvidenceRequirement,
  ExecutionPlan,
  ExecutionStage,
  RollbackStep,
  SagaCompileResult,
} from '../interfaces/action-graph.interface';

@Injectable()
export class ActionGraphSagaCompilerService {
  compile(graph: ActionGraph): SagaCompileResult {
    const errors: string[] = [];
    const nodeById = new Map(graph.nodes.map((n) => [n.nodeId, n]));
    const outgoing = this.buildOutgoing(graph.nodes, graph.edges, nodeById, errors);
    const indegree = this.buildIndegree(graph.nodes, graph.edges, nodeById, errors);
    const topo = this.topologicalSort(graph.nodes, outgoing, indegree);
    if (topo.length !== graph.nodes.length) {
      errors.push('GRAPH_CYCLE_ERROR: ActionGraph must be DAG.');
    }

    this.validateIrreversibleTerminal(graph.nodes, outgoing, errors);
    this.validateFinancialInventoryIdempotency(graph.nodes, errors);
    this.validateSignatureBeforeCommit(graph, errors);
    this.validateHighRiskCompensation(graph.nodes, errors);

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    const stages = this.buildStages(topo);
    const rollbackPlan = {
      steps: this.buildRollbackSteps(topo),
    };
    const requiredEvidence = this.buildEvidenceRequirements(graph.nodes);
    const plan: ExecutionPlan = {
      planId: `exec_plan_${graph.graphId}`,
      graphId: graph.graphId,
      stages,
      rollbackPlan,
      requiredEvidence,
      riskLevel: this.pickMaxRisk(graph.nodes),
      createdAt: new Date().toISOString(),
    };
    return {
      valid: true,
      plan,
      errors: [],
    };
  }

  private buildOutgoing(
    nodes: ActionNode[],
    edges: ActionEdge[],
    nodeById: Map<string, ActionNode>,
    errors: string[],
  ): Map<string, string[]> {
    const outgoing = new Map(nodes.map((n) => [n.nodeId, [] as string[]]));
    for (const edge of edges) {
      if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) {
        errors.push(`GRAPH_REFERENCE_ERROR: edge(${edge.from} -> ${edge.to}) references unknown node.`);
        continue;
      }
      outgoing.get(edge.from)!.push(edge.to);
    }
    return outgoing;
  }

  private buildIndegree(
    nodes: ActionNode[],
    edges: ActionEdge[],
    nodeById: Map<string, ActionNode>,
    errors: string[],
  ): Map<string, number> {
    const indegree = new Map(nodes.map((n) => [n.nodeId, 0]));
    for (const edge of edges) {
      if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) {
        errors.push(`GRAPH_REFERENCE_ERROR: edge(${edge.from} -> ${edge.to}) references unknown node.`);
        continue;
      }
      indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    }
    return indegree;
  }

  private topologicalSort(
    nodes: ActionNode[],
    outgoing: Map<string, string[]>,
    indegree: Map<string, number>,
  ): ActionNode[] {
    const queue: string[] = nodes.filter((n) => (indegree.get(n.nodeId) ?? 0) === 0).map((n) => n.nodeId);
    const nodeById = new Map(nodes.map((n) => [n.nodeId, n]));
    const sorted: ActionNode[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(nodeById.get(current)!);
      for (const next of outgoing.get(current) ?? []) {
        const nextIn = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, nextIn);
        if (nextIn === 0) {
          queue.push(next);
        }
      }
    }
    return sorted;
  }

  private validateIrreversibleTerminal(
    nodes: ActionNode[],
    outgoing: Map<string, string[]>,
    errors: string[],
  ): void {
    for (const node of nodes) {
      const irreversible = Boolean(node.isIrreversible) || this.isNotificationLike(node);
      if (!irreversible) continue;
      if ((outgoing.get(node.nodeId) ?? []).length > 0) {
        errors.push(`IRREVERSIBLE_NOT_TERMINAL: node=${node.nodeId} must be terminal.`);
      }
    }
  }

  private validateFinancialInventoryIdempotency(nodes: ActionNode[], errors: string[]): void {
    for (const node of nodes) {
      const actionUpper = node.actionType.toUpperCase();
      const handlerUpper = node.handlerId.toUpperCase();
      const requiresIdem =
        actionUpper.startsWith('FINANCIAL_') ||
        actionUpper.startsWith('INVENTORY_') ||
        handlerUpper.includes('FINANCIAL') ||
        handlerUpper.includes('INVENTORY');
      if (!requiresIdem) continue;
      if (!String(node.idempotencyKey ?? '').trim()) {
        errors.push(`IDEMPOTENCY_KEY_REQUIRED: node=${node.nodeId} (${node.actionType}).`);
      }
    }
  }

  private validateSignatureBeforeCommit(graph: ActionGraph, errors: string[]): void {
    const hasCommitLike = graph.nodes.some((n) => this.isCommitLike(n));
    if (!hasCommitLike) return;
    const sig = graph.contextSignature;
    const valid =
      sig &&
      String(sig.signatureId ?? '').trim() &&
      String(sig.physicalHash ?? '').trim() &&
      String(sig.resourceHash ?? '').trim() &&
      String(sig.policyVersion ?? '').trim();
    if (!valid) {
      errors.push('SIGNATURE_CHECK_REQUIRED: commit-like action requires contextSignature v1.2.');
    }
  }

  private validateHighRiskCompensation(nodes: ActionNode[], errors: string[]): void {
    for (const node of nodes) {
      const highRisk = node.riskLevel === 'HIGH' || node.riskLevel === 'CRITICAL';
      if (!highRisk) continue;
      if (node.isIrreversible) continue;
      if (!String(node.compensationHandlerId ?? '').trim()) {
        errors.push(`COMPENSATION_REQUIRED_FOR_HIGH_RISK: node=${node.nodeId}.`);
      }
    }
  }

  private buildStages(sortedNodes: ActionNode[]): ExecutionStage[] {
    const buckets: Record<string, ActionNode[]> = {
      dry_run: [],
      lock: [],
      commit: [],
      state_mutation: [],
      irreversible: [],
    };
    for (const node of sortedNodes) {
      const stage = this.classifyStage(node);
      buckets[stage].push(node);
    }
    const stages: ExecutionStage[] = [];
    if (buckets.dry_run.length > 0) {
      stages.push({ stageId: 'dry_run', mode: 'PARALLEL', actions: buckets.dry_run, onFailure: 'BLOCK' });
    }
    if (buckets.lock.length > 0) {
      stages.push({ stageId: 'lock', mode: 'SEQUENTIAL', actions: buckets.lock, onFailure: 'RETRY' });
    }
    if (buckets.commit.length > 0) {
      stages.push({ stageId: 'commit', mode: 'SEQUENTIAL', actions: buckets.commit, onFailure: 'COMPENSATE' });
    }
    if (buckets.state_mutation.length > 0) {
      stages.push({ stageId: 'state_mutation', mode: 'SEQUENTIAL', actions: buckets.state_mutation, onFailure: 'BLOCK' });
    }
    if (buckets.irreversible.length > 0) {
      stages.push({ stageId: 'irreversible', mode: 'SEQUENTIAL', actions: buckets.irreversible, onFailure: 'MANUAL_REVIEW' });
    }
    return stages;
  }

  private classifyStage(node: ActionNode): 'dry_run' | 'lock' | 'commit' | 'state_mutation' | 'irreversible' {
    if (node.isIrreversible || this.isNotificationLike(node)) return 'irreversible';
    const action = node.actionType.toUpperCase();
    if (action.includes('CHECK') || action.includes('SEARCH') || action.includes('DRY_RUN') || action.includes('RECOMPUTE')) return 'dry_run';
    if (action.includes('LOCK') || action.includes('HOLD')) return 'lock';
    if (action.includes('COMMIT') || action.includes('CAPTURE') || action.includes('CANCEL')) return 'commit';
    if (action.includes('MUTATE') || action.includes('ADJUST') || action.includes('UPDATE')) return 'state_mutation';
    return 'state_mutation';
  }

  private buildRollbackSteps(sortedNodes: ActionNode[]): RollbackStep[] {
    const comp = sortedNodes
      .filter((n) => String(n.compensationHandlerId ?? '').trim())
      .reverse();
    return comp.map((n, idx) => ({
      originalActionId: n.nodeId,
      compensationHandlerId: String(n.compensationHandlerId),
      order: idx + 1,
    }));
  }

  private buildEvidenceRequirements(nodes: ActionNode[]): EvidenceRequirement[] {
    const out: EvidenceRequirement[] = [];
    for (const node of nodes) {
      if (node.riskLevel === 'HIGH' || node.riskLevel === 'CRITICAL') {
        out.push({ actionId: node.nodeId, requirement: 'HIGH_RISK_EVIDENCE_CARD' });
      }
      const actionUpper = node.actionType.toUpperCase();
      if (actionUpper.startsWith('FINANCIAL_')) {
        out.push({ actionId: node.nodeId, requirement: 'FINANCIAL_EVIDENCE_CARD' });
      }
      if (actionUpper.startsWith('INVENTORY_')) {
        out.push({ actionId: node.nodeId, requirement: 'INVENTORY_EVIDENCE_CARD' });
      }
    }
    return out;
  }

  private pickMaxRisk(nodes: ActionNode[]): ActionRiskLevel {
    const rank: Record<ActionRiskLevel, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    let best: ActionRiskLevel = 'LOW';
    for (const node of nodes) {
      if (rank[node.riskLevel] > rank[best]) {
        best = node.riskLevel;
      }
    }
    return best;
  }

  private isCommitLike(node: ActionNode): boolean {
    const action = node.actionType.toUpperCase();
    return action.includes('COMMIT') || action.includes('CAPTURE') || action.includes('PAYMENT');
  }

  private isNotificationLike(node: ActionNode): boolean {
    const action = node.actionType.toUpperCase();
    const handler = node.handlerId.toUpperCase();
    return action.includes('NOTIFY') || action.includes('SEND') || handler.includes('NOTIFY');
  }
}
