/**
 * Knowledge DecisionCase — Situation → Options → Choice → Outcome → Regret.
 * Projected from DecisionEpisodeV1; NOT the runtime decision-queue DecisionCase.
 */

export const KNOWLEDGE_DECISION_CASE_SCHEMA =
  'tripnara.knowledge_decision_case@v1' as const;

export type KnowledgeDecisionRegret = 'LOW' | 'MEDIUM' | 'HIGH' | null;

export type KnowledgeDecisionUserChoiceAction =
  | 'ACCEPT'
  | 'OVERRIDE'
  | 'REJECT_ALL'
  | 'NO_ACTION';

export type KnowledgeDecisionOutcomeLabel =
  | 'SUCCESS'
  | 'PARTIAL'
  | 'FAILURE'
  | 'UNKNOWN'
  | 'PENDING';

export type KnowledgeEvidenceRef = {
  evidenceId: string;
  provider: string;
  observedAt?: string;
  uri?: string;
};

/**
 * Cross-trip searchable decision knowledge asset.
 * Query facets V1: country · decisionType · situationTags · riskType · outcome · regret
 */
export type KnowledgeDecisionCase = {
  schemaId: typeof KNOWLEDGE_DECISION_CASE_SCHEMA;
  version: 1;
  caseId: string;
  /** Upstream episode (1:1 for V1 projector) */
  episodeId: string;
  tripId: string;
  country: string;
  decisionType: string;
  situationTags: string[];
  riskType: string | null;
  situationSnapshotId: string | null;
  userGoal?: string;
  constraintIds: string[];
  evidence: KnowledgeEvidenceRef[];
  options: Array<{ optionId: string; summary: string }>;
  evaluation?: Record<string, unknown>;
  recommendedOptionId?: string;
  userChoice: {
    action: KnowledgeDecisionUserChoiceAction;
    selected?: string;
    reason?: string;
  };
  appliedAction?: string;
  outcome: {
    label: KnowledgeDecisionOutcomeLabel;
    raw?: Record<string, unknown>;
  };
  regret: KnowledgeDecisionRegret;
  confidence: number;
  sourceRefs?: {
    cgusDecisionId?: string | null;
    travelEventIds?: string[];
  };
  projectedAt: string;
  /** true when seeded / registered outside hot Map */
  durable: boolean;
};

export type KnowledgeDecisionCaseListFilter = {
  country?: string;
  decisionType?: string;
  /** comma-separated or array; match if case has ANY tag */
  situationTags?: string | string[];
  riskType?: string;
  outcome?: KnowledgeDecisionOutcomeLabel | string;
  userChoice?: KnowledgeDecisionUserChoiceAction | string;
  regret?: KnowledgeDecisionRegret | string;
  tripId?: string;
  page?: number;
  pageSize?: number;
};

export type SimilarCasesQuery = {
  country?: string;
  decisionType?: string;
  situationTags?: string[];
  riskType?: string | null;
  /** exclude self */
  excludeCaseId?: string;
  limit?: number;
};
