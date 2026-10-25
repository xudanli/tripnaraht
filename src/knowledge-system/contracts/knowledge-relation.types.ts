/**
 * Knowledge System Phase 3 — Relation Vocabulary (V1 十二词)
 * SSOT: internal-docs/product/tripnara-knowledge-system-execution-plan-v2.md §Phase 3
 */

export const KNOWLEDGE_RELATION_TYPES_V1 = [
  'LOCATED_IN',
  'NEAR',
  'CONNECTED_TO',
  'ON_ROUTE',
  'CO_VISIT',
  'ALTERNATIVE_TO',
  'SOFT_ALTERNATIVE',
  'REQUIRES',
  'INCOMPATIBLE_WITH',
  'SUITABLE_FOR',
  'AFFECTS',
  'INCREASES_RISK_OF',
] as const;

export type KnowledgeRelationType = (typeof KNOWLEDGE_RELATION_TYPES_V1)[number];

/** Contract-only; not populated at scale in Phase 3 */
export const KNOWLEDGE_TYPE_RELATION_TYPES = ['INSTANCE_OF', 'SUBCLASS_OF'] as const;

export type KnowledgeRelationSource =
  | 'golden_set'
  | 'poi_alternatives'
  | 'causal_chains'
  | 'spatial'
  | 'manual';

/** Adapter-projected sources replaced on reproject; `manual` is preserved. */
export const PROJECTED_RELATION_SOURCES: readonly KnowledgeRelationSource[] = [
  'golden_set',
  'poi_alternatives',
  'causal_chains',
  'spatial',
];

/** Path / impact query relation-type filters (V1 vocab groups, not country data). */
export const GRAPH_RELATION_TYPE_GROUPS = {
  semantic: ['ALTERNATIVE_TO', 'SOFT_ALTERNATIVE', 'CO_VISIT', 'NEAR', 'CONNECTED_TO'],
  constraint: ['REQUIRES', 'INCOMPATIBLE_WITH', 'SUITABLE_FOR', 'INCREASES_RISK_OF', 'AFFECTS'],
  risk: ['INCREASES_RISK_OF', 'AFFECTS', 'INCOMPATIBLE_WITH'],
  alternative: ['ALTERNATIVE_TO', 'SOFT_ALTERNATIVE'],
} as const satisfies Record<string, readonly KnowledgeRelationType[]>;

/** Adapter default confidence when the source record has none. */
export const RELATION_ADAPTER_CONFIDENCE = {
  golden_set: 0.85,
  causal_chains: 0.8,
  spatial: 0.7,
  poi_alternative_primary: 0.9,
  poi_alternative_secondary: 0.75,
  poi_soft_primary: 0.88,
  poi_soft_secondary: 0.7,
  manual_default: 0.9,
} as const;

export interface KnowledgeRelation {
  relationId: string;
  type: KnowledgeRelationType;
  from: string;
  to: string;
  confidence: number;
  source: KnowledgeRelationSource;
  sourceRef?: string;
  country?: string;
  validFrom?: string;
  validTo?: string;
  /** e.g. originalType=CO_VISIT_CLUSTER, groupId, edgeType */
  metadata?: Record<string, unknown>;
  condition?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface RelationVocabularyRow {
  type: KnowledgeRelationType;
  meaningZh: string;
  meaningEn: string;
  count: number;
  sources: KnowledgeRelationSource[];
}

export interface RelationProjectionRow {
  source: KnowledgeRelationSource;
  originalType: string;
  projectedType: KnowledgeRelationType;
  sampleFrom?: string;
  sampleTo?: string;
  note?: string;
}

export const RELATION_VOCABULARY_META: Record<
  KnowledgeRelationType,
  { meaningZh: string; meaningEn: string }
> = {
  LOCATED_IN: { meaningZh: '位于', meaningEn: 'Located in' },
  NEAR: { meaningZh: '邻近', meaningEn: 'Near' },
  CONNECTED_TO: { meaningZh: '路网连接', meaningEn: 'Connected to' },
  ON_ROUTE: { meaningZh: '在路线上', meaningEn: 'On route' },
  CO_VISIT: { meaningZh: '共访/同日适合', meaningEn: 'Co-visit' },
  ALTERNATIVE_TO: { meaningZh: '可替代', meaningEn: 'Alternative to' },
  SOFT_ALTERNATIVE: { meaningZh: '软替代', meaningEn: 'Soft alternative' },
  REQUIRES: { meaningZh: '依赖/需要', meaningEn: 'Requires' },
  INCOMPATIBLE_WITH: { meaningZh: '不兼容', meaningEn: 'Incompatible with' },
  SUITABLE_FOR: { meaningZh: '适合', meaningEn: 'Suitable for' },
  AFFECTS: { meaningZh: '影响', meaningEn: 'Affects' },
  INCREASES_RISK_OF: { meaningZh: '提高风险', meaningEn: 'Increases risk of' },
};
