/**
 * Decision Runtime provider contracts — Agent outputs structured artifacts only.
 * @see DECISION_RUNTIME_MATURITY.md §8 P2
 */

import type { CanonicalConstraintReport } from '../../constraints/contracts/canonical-constraint-report';
import type { TripWorldState } from '../../../trips/decision/world-model';
import type { TripPlan } from '../../../trips/decision/plan-model';
import type { DecisionCandidate, PlanningContext } from './decision-candidate';

export const CANDIDATE_GENERATION_PROVIDER = Symbol('CANDIDATE_GENERATION_PROVIDER');
export const REPAIR_PROVIDER = Symbol('REPAIR_PROVIDER');
export const RESEARCH_PROVIDER = Symbol('RESEARCH_PROVIDER');
export const NARRATION_PROVIDER = Symbol('NARRATION_PROVIDER');
export const CRITIC_PROVIDER = Symbol('CRITIC_PROVIDER');

export type DecisionProviderId =
  | 'legacy-trip-planning'
  | 'guide-plan-variants'
  | 'neptune-repair'
  | 'agentic-research'
  | 'agentic-narration'
  | 'constraint-critic';

export interface CandidateGenerationResult {
  schemaId: 'tripnara.candidate_generation_result@v1';
  providerId: DecisionProviderId;
  tripId: string;
  candidates: DecisionCandidate[];
  generatedAt: string;
}

export interface CandidateGenerationProvider {
  readonly providerId: DecisionProviderId;
  generateCandidates(
    worldState: TripWorldState,
    context: PlanningContext,
  ): Promise<CandidateGenerationResult>;
}

export interface RepairProposal {
  proposalId: string;
  candidateId: string;
  label?: string;
  plan?: TripPlan;
  reasonCodes?: string[];
}

export interface RepairProviderResult {
  schemaId: 'tripnara.repair_provider_result@v1';
  providerId: DecisionProviderId;
  tripId: string;
  proposals: RepairProposal[];
  generatedAt: string;
  /** Full Neptune repair candidates when providerId is neptune-repair */
  rfc001RepairCandidates?: import('../../../trips/guardian-decision-core/contracts/guardian-outputs.types').Rfc001RepairCandidate[];
}

export interface RepairProviderInput {
  tripId: string;
  worldState: TripWorldState;
  basePlan?: TripPlan;
  constraintReport?: CanonicalConstraintReport;
  /** Provider-specific payload — Neptune reads `neptune` key. */
  providerContext?: Record<string, unknown>;
}

export interface RepairProvider {
  readonly providerId: DecisionProviderId;
  proposeRepairs(input: RepairProviderInput): Promise<RepairProviderResult>;
}

export interface ResearchEvidenceArtifact {
  evidenceId: string;
  kind: string;
  summary?: string;
  payload?: Record<string, unknown>;
}

export interface ResearchProviderResult {
  schemaId: 'tripnara.research_provider_result@v1';
  providerId: DecisionProviderId;
  tripId: string;
  artifacts: ResearchEvidenceArtifact[];
  generatedAt: string;
}

export interface ResearchProvider {
  readonly providerId: DecisionProviderId;
  gatherResearch(input: {
    tripId: string;
    query?: string;
    worldState?: TripWorldState;
  }): Promise<ResearchProviderResult>;
}

export interface DecisionExplanation {
  summary: string;
  sections?: Array<{ title: string; body: string }>;
}

export interface NarrationProviderResult {
  schemaId: 'tripnara.narration_provider_result@v1';
  providerId: DecisionProviderId;
  tripId: string;
  explanation: DecisionExplanation;
  generatedAt: string;
}

export interface NarrationProvider {
  readonly providerId: DecisionProviderId;
  explain(input: {
    tripId: string;
    plan?: TripPlan;
    decisionRecordId?: string;
  }): Promise<NarrationProviderResult>;
}

export interface CriticSignal {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message?: string;
}

export interface CriticProviderResult {
  schemaId: 'tripnara.critic_provider_result@v1';
  providerId: DecisionProviderId;
  tripId: string;
  signals: CriticSignal[];
  generatedAt: string;
}

export interface CriticProvider {
  readonly providerId: DecisionProviderId;
  critique(input: {
    tripId: string;
    plan?: TripPlan;
    worldState?: TripWorldState;
  }): Promise<CriticProviderResult>;
}
