/**
 * Admin Graph view DTOs — assembled from KnowledgeRelation projections (not Neo4j).
 */

export type KnowledgeGraphNode = {
  id: string;
  label: string;
  type: string;
  icon?: string;
};

export type KnowledgeGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  indirect?: boolean;
  confidence?: number;
};

export type KnowledgeGraphStats = {
  nodeCount: number;
  edgeCount: number;
  nodeDeltaWeek?: number | null;
  edgeDeltaWeek?: number | null;
  subgraphCount?: number | null;
  lastUpdated?: string;
};

export type KnowledgeGraphSubgraphResponse = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  stats?: KnowledgeGraphStats;
  note: string;
};

export type KnowledgeGraphPathCandidate = {
  pathId: string;
  summary: string;
  jumps: number;
  pathType: 'shortest' | 'semantic' | 'constraint';
  confidence: number;
  semanticDistance?: number;
  coveredRelations: string[];
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  isPrimary?: boolean;
};

export type KnowledgeGraphPathQueryResponse = {
  candidates: KnowledgeGraphPathCandidate[];
  analytics?: {
    queryTypeDistribution: Array<{ type: string; count: number }>;
    topIntermediateNodes: Array<{ id: string; label: string; count: number }>;
    latencyP50Ms?: number;
  };
  inventory?: KnowledgeGraphStats;
  note: string;
};

export type KnowledgeGraphImpactEntity = {
  targetEntityId: string;
  name: string;
  impactType: 'direct' | 'indirect' | 'risk' | 'alternative';
  relationPath: string[];
  intensity?: number;
  confidence?: number;
  suggestedAction?: string;
};

export type KnowledgeGraphImpactResponse = {
  summary: {
    direct: number;
    indirect: number;
    risk: number;
    alternative: number;
    coveredEntities: number;
  };
  graph: { nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] };
  entities: KnowledgeGraphImpactEntity[];
  charts?: {
    typeDistribution: Array<{ type: string; count: number }>;
    highRiskCategories: Array<{ category: string; count: number }>;
    coverage?: number;
  };
  note: string;
};
