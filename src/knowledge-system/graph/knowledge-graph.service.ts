/**
 * Knowledge Graph Admin views — BFS over KnowledgeRelation projections.
 * Not a graph database; product UI 「知识图谱」tabs consume these APIs.
 */

import { Injectable, Logger } from '@nestjs/common';
import { EntityIdentityRegistryService } from '../identity/entity-identity-registry.service';
import { KnowledgeRelationRegistryService } from '../relations/knowledge-relation-registry.service';
import {
  GRAPH_RELATION_TYPE_GROUPS,
  type KnowledgeRelation,
  type KnowledgeRelationType,
} from '../contracts/knowledge-relation.types';
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphImpactEntity,
  KnowledgeGraphImpactResponse,
  KnowledgeGraphNode,
  KnowledgeGraphPathCandidate,
  KnowledgeGraphPathQueryResponse,
  KnowledgeGraphStats,
  KnowledgeGraphSubgraphResponse,
} from '../contracts/knowledge-graph-view.types';
import { buildGraphStats } from './graph-inventory.util';
import { iconForGraphNodeType, inferGraphNodeType } from './infer-graph-node-type.util';

const RISK_TYPES = new Set<string>(GRAPH_RELATION_TYPE_GROUPS.risk);
const ALT_TYPES = new Set<string>(GRAPH_RELATION_TYPE_GROUPS.alternative);
const CONSTRAINT_TYPES = new Set<string>(GRAPH_RELATION_TYPE_GROUPS.constraint);
const SEMANTIC_TYPES = new Set<string>(GRAPH_RELATION_TYPE_GROUPS.semantic);

type AdjEdge = { to: string; relation: KnowledgeRelation };

@Injectable()
export class KnowledgeGraphService {
  private readonly logger = new Logger(KnowledgeGraphService.name);

  constructor(
    private readonly relations: KnowledgeRelationRegistryService,
    private readonly identity: EntityIdentityRegistryService,
  ) {}

  subgraph(input: {
    q?: string;
    entityType?: string;
    relationType?: string;
    country?: string;
    focusEntityId?: string;
    limit?: number;
  }): KnowledgeGraphSubgraphResponse {
    const limit = Math.min(500, Math.max(10, input.limit ?? 80));
    let rels = this.relations.listAll({
      type: input.relationType as KnowledgeRelationType | undefined,
      country: input.country,
    });

    if (input.focusEntityId) {
      const focus = input.focusEntityId;
      const seed = new Set<string>([focus]);
      const frontier = [focus];
      const picked: KnowledgeRelation[] = [];
      const seenRel = new Set<string>();
      while (frontier.length && picked.length < limit) {
        const cur = frontier.shift()!;
        for (const r of rels) {
          if (seenRel.has(r.relationId)) continue;
          if (r.from !== cur && r.to !== cur) continue;
          seenRel.add(r.relationId);
          picked.push(r);
          const other = r.from === cur ? r.to : r.from;
          if (!seed.has(other)) {
            seed.add(other);
            frontier.push(other);
          }
          if (picked.length >= limit) break;
        }
      }
      rels = picked;
    }

    if (input.q?.trim()) {
      const q = input.q.trim().toLowerCase();
      rels = rels.filter(
        (r) =>
          r.from.toLowerCase().includes(q) ||
          r.to.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          r.relationId.toLowerCase().includes(q),
      );
    }

    const { nodes, edges } = this.assembleGraph(rels, {
      entityType: input.entityType,
      edgeLimit: limit,
    });

    return {
      nodes,
      edges,
      stats: this.inventoryStats(nodes.length, edges.length, rels),
      note: 'Assembled from KnowledgeRelation projections (Golden Set / POI / Causal / Spatial). Not Neo4j.',
    };
  }

  pathQuery(input: {
    startEntityId: string;
    endEntityId: string;
    maxDepth?: number;
    pathType?: 'shortest' | 'semantic' | 'constraint';
    country?: string;
    allowedRelationTypes?: string[];
  }): KnowledgeGraphPathQueryResponse {
    const t0 = Date.now();
    const maxDepth = Math.min(8, Math.max(1, input.maxDepth ?? 4));
    const pathType = input.pathType ?? 'shortest';
    let rels = this.relations.listAll({ country: input.country });

    if (input.allowedRelationTypes?.length) {
      const allow = new Set(input.allowedRelationTypes);
      rels = rels.filter((r) => allow.has(r.type));
    } else if (pathType === 'constraint') {
      rels = rels.filter((r) => CONSTRAINT_TYPES.has(r.type) || RISK_TYPES.has(r.type));
    } else if (pathType === 'semantic') {
      rels = rels.filter((r) => SEMANTIC_TYPES.has(r.type));
    }

    const adj = this.buildAdj(rels);
    const paths = this.findPaths(
      adj,
      input.startEntityId,
      input.endEntityId,
      maxDepth,
      pathType === 'shortest' ? 3 : 5,
    );

    const candidates: KnowledgeGraphPathCandidate[] = paths.map((p, i) => {
      const edgeObjs = p.edges;
      const nodeIds = p.nodes;
      const conf =
        edgeObjs.length === 0
          ? 0
          : edgeObjs.reduce((s, e) => s + (e.confidence ?? 0.7), 0) / edgeObjs.length;
      return {
        pathId: `path_${i}_${input.startEntityId}_${input.endEntityId}`.slice(0, 96),
        summary: nodeIds.map((id) => this.nodeLabel(id)).join(' → '),
        jumps: Math.max(0, nodeIds.length - 1),
        pathType,
        confidence: Number(conf.toFixed(3)),
        semanticDistance: pathType === 'semantic' ? nodeIds.length - 1 : undefined,
        coveredRelations: [...new Set(edgeObjs.map((e) => e.type))],
        nodes: nodeIds.map((id) => this.toNode(id)),
        edges: edgeObjs,
        isPrimary: i === 0,
      };
    });

    const intermediate = new Map<string, number>();
    for (const c of candidates) {
      for (const n of c.nodes.slice(1, -1)) {
        intermediate.set(n.id, (intermediate.get(n.id) ?? 0) + 1);
      }
    }

    const latency = Date.now() - t0;
    this.logger.debug(
      `pathQuery ${input.startEntityId}→${input.endEntityId} candidates=${candidates.length} ms=${latency}`,
    );

    return {
      candidates,
      analytics: {
        queryTypeDistribution: [{ type: pathType, count: candidates.length }],
        topIntermediateNodes: [...intermediate.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([id, count]) => ({ id, label: this.nodeLabel(id), count })),
        latencyP50Ms: latency,
      },
      inventory: this.inventoryStats(
        new Set(rels.flatMap((r) => [r.from, r.to])).size,
        rels.length,
        rels,
      ),
      note: 'BFS over projected relations; semantic/constraint filter relation types.',
    };
  }

  impactAnalysis(input: {
    sourceEntityIds: string[];
    impactType?: 'all' | 'direct' | 'indirect' | 'risk' | 'alternative';
    maxDepth?: number;
    country?: string;
  }): KnowledgeGraphImpactResponse {
    const maxDepth = Math.min(6, Math.max(1, input.maxDepth ?? 2));
    const impactType = input.impactType ?? 'all';
    const sources = input.sourceEntityIds.filter(Boolean);
    let rels = this.relations.listAll({ country: input.country });

    if (impactType === 'risk') {
      rels = rels.filter((r) => RISK_TYPES.has(r.type));
    } else if (impactType === 'alternative') {
      rels = rels.filter((r) => ALT_TYPES.has(r.type));
    }

    const adj = this.buildAdj(rels);
    const entities: KnowledgeGraphImpactEntity[] = [];
    const usedRels: KnowledgeRelation[] = [];
    const seenTarget = new Set<string>();

    for (const src of sources) {
      const visited = new Map<string, { depth: number; path: string[]; via: KnowledgeRelation[] }>();
      visited.set(src, { depth: 0, path: [src], via: [] });
      const queue = [src];
      while (queue.length) {
        const cur = queue.shift()!;
        const meta = visited.get(cur)!;
        if (meta.depth >= maxDepth) continue;
        for (const step of adj.get(cur) ?? []) {
          if (visited.has(step.to)) continue;
          const nextPath = [...meta.path, step.to];
          const nextVia = [...meta.via, step.relation];
          visited.set(step.to, {
            depth: meta.depth + 1,
            path: nextPath,
            via: nextVia,
          });
          queue.push(step.to);
          usedRels.push(step.relation);

          if (sources.includes(step.to)) continue;
          if (seenTarget.has(step.to)) continue;
          seenTarget.add(step.to);

          const depth = meta.depth + 1;
          const lastType = step.relation.type;
          let kind: KnowledgeGraphImpactEntity['impactType'] = depth === 1 ? 'direct' : 'indirect';
          if (RISK_TYPES.has(lastType)) kind = 'risk';
          else if (ALT_TYPES.has(lastType)) kind = 'alternative';

          if (impactType === 'direct' && kind !== 'direct') continue;
          if (impactType === 'indirect' && kind !== 'indirect') continue;
          if (impactType === 'risk' && kind !== 'risk') continue;
          if (impactType === 'alternative' && kind !== 'alternative') continue;

          entities.push({
            targetEntityId: step.to,
            name: this.nodeLabel(step.to),
            impactType: kind,
            relationPath: nextPath,
            intensity: Number((1 / depth).toFixed(3)),
            confidence: step.relation.confidence,
            suggestedAction: this.suggestAction(kind, lastType),
          });
        }
      }
    }

    const { nodes, edges } = this.assembleGraph(usedRels, { edgeLimit: 400 });
    const summary = {
      direct: entities.filter((e) => e.impactType === 'direct').length,
      indirect: entities.filter((e) => e.impactType === 'indirect').length,
      risk: entities.filter((e) => e.impactType === 'risk').length,
      alternative: entities.filter((e) => e.impactType === 'alternative').length,
      coveredEntities: new Set(entities.map((e) => e.targetEntityId)).size,
    };

    const typeDist = new Map<string, number>();
    for (const e of edges) typeDist.set(e.type, (typeDist.get(e.type) ?? 0) + 1);

    return {
      summary,
      graph: { nodes, edges },
      entities: entities.slice(0, 200),
      charts: {
        typeDistribution: [...typeDist.entries()].map(([type, count]) => ({ type, count })),
        highRiskCategories: entities
          .filter((e) => e.impactType === 'risk')
          .slice(0, 10)
          .map((e) => ({ category: e.name, count: 1 })),
        coverage: sources.length
          ? Number((summary.coveredEntities / Math.max(1, nodes.length)).toFixed(3))
          : 0,
      },
      note: 'Impact = BFS neighborhood over projected relations; risk/alternative by relation type.',
    };
  }

  private suggestAction(
    kind: KnowledgeGraphImpactEntity['impactType'],
    relType: string,
  ): string {
    if (kind === 'risk') return `Review ${relType} evidence before HARD BLOCK`;
    if (kind === 'alternative') return `Consider soft alternative via ${relType}`;
    if (kind === 'direct') return 'Inspect direct relation in Relations tab';
    return 'Trace multi-hop path in Path Query';
  }

  private inventoryStats(
    nodeCount: number,
    edgeCount: number,
    viewRels: KnowledgeRelation[],
  ): KnowledgeGraphStats {
    return buildGraphStats({
      viewNodeCount: nodeCount,
      viewEdgeCount: edgeCount,
      viewRels,
      catalogRels: this.relations.listAll(),
      lastUpdated: this.relations.getLastUpdated(),
    });
  }

  private nodeLabel(id: string): string {
    const ent = this.identity.get(id);
    return ent?.displayName || id;
  }

  private toNode(id: string): KnowledgeGraphNode {
    const type = this.identity.get(id)?.entityType || inferGraphNodeType(id);
    return {
      id,
      label: this.nodeLabel(id),
      type,
      icon: iconForGraphNodeType(type),
    };
  }

  private assembleGraph(
    rels: KnowledgeRelation[],
    opts?: { entityType?: string; edgeLimit?: number },
  ): { nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] } {
    const edgeLimit = opts?.edgeLimit ?? 200;
    const sliced = rels.slice(0, edgeLimit);
    const nodeIds = new Set<string>();
    const edges: KnowledgeGraphEdge[] = [];
    for (const r of sliced) {
      nodeIds.add(r.from);
      nodeIds.add(r.to);
      edges.push({
        id: r.relationId,
        source: r.from,
        target: r.to,
        type: r.type,
        confidence: r.confidence,
        indirect: false,
      });
    }
    let nodes = [...nodeIds].map((id) => this.toNode(id));
    if (opts?.entityType) {
      const t = opts.entityType.toLowerCase();
      nodes = nodes.filter((n) => n.type.toLowerCase().includes(t));
      const keep = new Set(nodes.map((n) => n.id));
      return {
        nodes,
        edges: edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
      };
    }
    return { nodes, edges };
  }

  private buildAdj(rels: KnowledgeRelation[]): Map<string, AdjEdge[]> {
    const adj = new Map<string, AdjEdge[]>();
    const add = (from: string, to: string, relation: KnowledgeRelation) => {
      const list = adj.get(from) ?? [];
      list.push({ to, relation });
      adj.set(from, list);
    };
    for (const r of rels) {
      add(r.from, r.to, r);
      add(r.to, r.from, r); // undirected for browse/path V1
    }
    return adj;
  }

  private findPaths(
    adj: Map<string, AdjEdge[]>,
    start: string,
    end: string,
    maxDepth: number,
    maxPaths: number,
  ): Array<{ nodes: string[]; edges: KnowledgeGraphEdge[] }> {
    if (start === end) {
      return [{ nodes: [start], edges: [] }];
    }
    const out: Array<{ nodes: string[]; edges: KnowledgeGraphEdge[] }> = [];
    const queue: Array<{ node: string; path: string[]; edges: KnowledgeGraphEdge[] }> = [
      { node: start, path: [start], edges: [] },
    ];
    const visitedAtDepth = new Map<string, number>();
    visitedAtDepth.set(start, 0);

    while (queue.length && out.length < maxPaths) {
      const cur = queue.shift()!;
      if (cur.path.length - 1 >= maxDepth) continue;
      for (const step of adj.get(cur.node) ?? []) {
        if (cur.path.includes(step.to)) continue;
        const nextPath = [...cur.path, step.to];
        const nextEdge: KnowledgeGraphEdge = {
          id: step.relation.relationId,
          source: cur.node,
          target: step.to,
          type: step.relation.type,
          confidence: step.relation.confidence,
        };
        const nextEdges = [...cur.edges, nextEdge];
        if (step.to === end) {
          out.push({ nodes: nextPath, edges: nextEdges });
          if (out.length >= maxPaths) break;
          continue;
        }
        const depth = nextPath.length - 1;
        const prev = visitedAtDepth.get(step.to);
        if (prev != null && prev < depth) continue;
        visitedAtDepth.set(step.to, depth);
        queue.push({ node: step.to, path: nextPath, edges: nextEdges });
      }
    }
    return out;
  }
}
