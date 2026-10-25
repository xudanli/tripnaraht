/**
 * Execution-risk causal-chains-v1.json → KnowledgeRelation[]
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  KnowledgeRelation,
  KnowledgeRelationType,
  RelationProjectionRow,
} from '../contracts/knowledge-relation.types';
import { RELATION_ADAPTER_CONFIDENCE } from '../contracts/knowledge-relation.types';

type CausalEdge = {
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
};

type CausalNode = {
  nodeId: string;
  knowledgeCode: string;
  nodeType?: string;
  description?: string;
};

type CausalChain = {
  chainId: string;
  knowledgeCode?: string;
  name?: string;
  nodes: CausalNode[];
  edges: CausalEdge[];
};

function mapEdgeType(edgeType: string): KnowledgeRelationType {
  const t = edgeType.toUpperCase();
  if (t === 'CAUSES') return 'INCREASES_RISK_OF';
  return 'AFFECTS'; // TRIGGERS / CONTRIBUTES / default
}

function riskId(code: string): string {
  return `risk:${code}`;
}

export function loadCausalChainsPackage(root = process.cwd()): CausalChain[] {
  const path = join(
    root,
    'docs/TripNARA-Execution-Risk-Backend-Package-V1/04_KNOWLEDGE/causal-chains-v1.json',
  );
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { chains?: CausalChain[] };
  return raw.chains ?? [];
}

export function projectCausalChainRelations(chains?: CausalChain[]): {
  relations: KnowledgeRelation[];
  projections: RelationProjectionRow[];
} {
  const list = chains ?? loadCausalChainsPackage();
  const relations: KnowledgeRelation[] = [];
  const projections: RelationProjectionRow[] = [
    {
      source: 'causal_chains',
      originalType: 'CAUSES',
      projectedType: 'INCREASES_RISK_OF',
      note: 'causal-chains-v1.json edgeType',
    },
    {
      source: 'causal_chains',
      originalType: 'TRIGGERS|CONTRIBUTES',
      projectedType: 'AFFECTS',
      note: 'Non-CAUSES edges collapse to AFFECTS in V1 vocab',
    },
  ];

  for (const chain of list) {
    const byNode = new Map(chain.nodes.map((n) => [n.nodeId, n]));
    for (const edge of chain.edges ?? []) {
      const fromN = byNode.get(edge.fromNodeId);
      const toN = byNode.get(edge.toNodeId);
      if (!fromN || !toN) continue;
      const type = mapEdgeType(edge.edgeType);
      relations.push({
        relationId: `causal:${chain.chainId}:${edge.fromNodeId}->${edge.toNodeId}`,
        type,
        from: riskId(fromN.knowledgeCode),
        to: riskId(toN.knowledgeCode),
        confidence: RELATION_ADAPTER_CONFIDENCE.causal_chains,
        source: 'causal_chains',
        sourceRef: `causal-chains-v1:${chain.chainId}`,
        metadata: {
          originalEdgeType: edge.edgeType,
          chainId: chain.chainId,
          chainName: chain.name,
          fromNodeType: fromN.nodeType,
          toNodeType: toN.nodeType,
          fromDescription: fromN.description,
          toDescription: toN.description,
        },
      });
    }
  }

  return { relations, projections };
}
