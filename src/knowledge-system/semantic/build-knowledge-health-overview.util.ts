/**
 * Aggregate Knowledge Control Center health — metrics only, not a volume dashboard.
 */

import type { EntityIdentityRegistryService } from '../identity/entity-identity-registry.service';
import type { KnowledgeWorldStateService } from '../world-state/knowledge-world-state.service';
import type { KnowledgeRelationRegistryService } from '../relations/knowledge-relation-registry.service';
import type { KnowledgeTravelerContextService } from '../traveler-context/knowledge-traveler-context.service';
import type { KnowledgeDecisionCaseService } from '../decision-knowledge/knowledge-decision-case.service';
import type { KnowledgeSemanticService } from '../semantic/knowledge-semantic.service';
import { SEMANTIC_HARD_BLOCK_POLICY } from '../semantic/vector-hard-block.guard.util';
import { resolveKnowledgeRuntimeSsotEnforceMode } from '../runtime/resolve-knowledge-ssot-enforce-mode.util';

export type KnowledgeHealthOverview = {
  phase: 6;
  /** Health metrics (not totals dashboard) */
  metrics: {
    canonicalEntityCoverage: number;
    unresolvedEntityCount: number;
    snapshotSsotCoverage: number | null;
    staleFactRate: number | null;
    relationStandardizationRate: number | null;
    etcConsumeCoverage: number | null;
    etcConsumeMode: string;
    decisionCaseCaptureRate: number | null;
    evidenceMissingRate: number | null;
    vectorHardBlockBanned: true;
  };
  redLines: {
    vectorMustNotHardBlock: true;
    noKnowledgeVolumeDashboard: true;
    noNeo4jThisPhase: true;
    policy: typeof SEMANTIC_HARD_BLOCK_POLICY;
  };
  runtimeConvergence: {
    ssotEnforceMode: 'off' | 'shadow' | 'active';
    wired: {
      prepareTickEtcIngress: true;
      constraintGatewayIngress: true;
      ontologyStaleFactFilter: true;
    };
    envHint: string;
  };
  countsForOps: {
    entityCount: number;
    snapshotCount: number | null;
    relationCount: number | null;
    decisionCaseCount: number | null;
    retrievalTraceCount: number;
  };
  note: string;
};

export function buildKnowledgeHealthOverview(deps: {
  identity: EntityIdentityRegistryService;
  worldState: KnowledgeWorldStateService;
  relations: KnowledgeRelationRegistryService;
  travelerContext: KnowledgeTravelerContextService;
  decisionCases: KnowledgeDecisionCaseService;
  semantic: KnowledgeSemanticService;
}): KnowledgeHealthOverview {
  const listed = deps.identity.list({ page: 1, pageSize: 1 });
  const unresolved = deps.identity.listUnresolved();
  const ws = deps.worldState.coverageStats();
  const etc = deps.travelerContext.coverageStats();
  const dc = deps.decisionCases.coverageStats();
  const sem = deps.semantic.coverageStats();

  return {
    phase: 6,
    metrics: {
      canonicalEntityCoverage: listed.total > 0 ? 1 : 0,
      unresolvedEntityCount: unresolved.length,
      snapshotSsotCoverage: ws.snapshotSsotCoverage,
      staleFactRate: ws.staleFactRate,
      relationStandardizationRate: deps.relations.standardizationRate(),
      etcConsumeCoverage: etc.etcConsumeCoverage,
      etcConsumeMode: etc.etcConsumeMode,
      decisionCaseCaptureRate: dc.decisionCaseCaptureRate,
      evidenceMissingRate: dc.evidenceMissingRate,
      vectorHardBlockBanned: true,
    },
    redLines: {
      vectorMustNotHardBlock: true,
      noKnowledgeVolumeDashboard: true,
      noNeo4jThisPhase: true,
      policy: SEMANTIC_HARD_BLOCK_POLICY,
    },
    runtimeConvergence: {
      ssotEnforceMode: resolveKnowledgeRuntimeSsotEnforceMode(),
      wired: {
        prepareTickEtcIngress: true,
        constraintGatewayIngress: true,
        ontologyStaleFactFilter: true,
      },
      envHint:
        'KNOWLEDGE_RUNTIME_SSOT_ENFORCE=off|shadow|active; EFFECTIVE_TRAVELER_CONTEXT_CONSUME=off|shadow|active',
    },
    countsForOps: {
      entityCount: listed.total,
      snapshotCount: ws.snapshotCount,
      relationCount: deps.relations.stats().relationCount,
      decisionCaseCount: dc.caseCount,
      retrievalTraceCount: sem.retrievalTraceCount,
    },
    note: 'Phase 6+ runtime: Identity place:db→CPRE; DecisionCase Prisma durable; Semantic/Health done',
  };
}
