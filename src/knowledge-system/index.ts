export * from './contracts/entity-identity.types';
export * from './contracts/knowledge-relation.types';
export * from './identity/normalize-canonical-id.util';
export {
  EntityIdentityRegistryService,
  softValidateWorldFactSubjectId,
  PHASE1_OBSERVED_SUBJECT_IDS,
} from './identity/entity-identity-registry.service';
export { KnowledgeWorldStateService } from './world-state/knowledge-world-state.service';
export { KnowledgeRelationRegistryService } from './relations/knowledge-relation-registry.service';
export {
  assertDecisionConsumerUsesSnapshot,
  WorldStateSsotViolationError,
  readSsotWorldFacts,
} from './world-state/snapshot-ssot.guard.util';
export {
  assessTravelWorldFactStale,
  filterFactsForHardBlock,
} from './world-state/travel-world-fact-stale.util';
export { ensureSnapshotWorldFacts } from './world-state/ensure-snapshot-world-facts.util';
export { KnowledgeTravelerContextService } from './traveler-context/knowledge-traveler-context.service';
export { KnowledgeDecisionCaseService } from './decision-knowledge/knowledge-decision-case.service';
export {
  projectEpisodeToKnowledgeCase,
  scoreSimilarCase,
} from './decision-knowledge/project-episode-to-case.util';
export * from './contracts/knowledge-decision-case.types';
export {
  assertVectorMustNotHardBlock,
  VectorHardBlockViolationError,
  SEMANTIC_HARD_BLOCK_POLICY,
} from './semantic/vector-hard-block.guard.util';
export { KnowledgeSemanticService } from './semantic/knowledge-semantic.service';
export { buildKnowledgeHealthOverview } from './semantic/build-knowledge-health-overview.util';
export {
  auditKnowledgeDecisionIngress,
  enforceKnowledgeDecisionIngress,
  KnowledgeRuntimeSsotViolationError,
} from './runtime/assert-knowledge-decision-ingress.util';
export { resolveKnowledgeRuntimeSsotEnforceMode } from './runtime/resolve-knowledge-ssot-enforce-mode.util';
export { selectFactsForOntologyHardBlock } from './runtime/select-facts-for-ontology-hard-block.util';
export { KnowledgeGraphService } from './graph/knowledge-graph.service';
export * from './contracts/knowledge-graph-view.types';
export { KnowledgeOntologyService } from './ontology/knowledge-ontology.service';
export {
  ONTOLOGY_CATALOG_VERSION,
  ONTOLOGY_TYPES,
  ONTOLOGY_ATTRIBUTES,
  ONTOLOGY_PREDICATES,
} from './ontology/ontology-catalog';
export type {
  OntologyEnumValue,
  OntologyAttributeDef,
  OntologyTypeDef,
} from './ontology/ontology-catalog';
export { KnowledgeSystemModule } from './knowledge-system.module';
