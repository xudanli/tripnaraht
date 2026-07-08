/**
 * Decision Provider Registry — unified catalog of structured Agent/Planning providers.
 * @see DECISION_RUNTIME_ROADMAP.md §3.2 A2
 */

import { Injectable, Optional } from '@nestjs/common';
import type { DecisionProviderId } from './contracts/decision-providers';
import { LegacyCandidateGenerationProvider } from './providers/legacy-candidate-generation.provider';
import { NeptuneRepairProvider } from './providers/neptune-repair.provider';
import { ConstraintCriticProvider } from './providers/constraint-critic.provider';
import { AgenticResearchProvider } from './providers/agentic-research.provider';
import { AgenticNarrationProvider } from './providers/agentic-narration.provider';

export const PROVIDER_REGISTRY_VERSION = 'decision-providers@v1';

export type ProviderKind =
  | 'candidate'
  | 'repair'
  | 'research'
  | 'narration'
  | 'critic';

export type ProviderRegistryStatus = 'ACTIVE' | 'PLANNED';

export interface ProviderRegistryEntry {
  providerId: DecisionProviderId;
  kind: ProviderKind;
  version: string;
  outputSchemaId: string;
  scenarios: string[];
  status: ProviderRegistryStatus;
  runtimeBound: boolean;
}

export interface ProviderRegistrySnapshot {
  schemaId: 'tripnara.decision_provider_registry@v1';
  registryVersion: typeof PROVIDER_REGISTRY_VERSION;
  generatedAt: string;
  providers: ProviderRegistryEntry[];
}

const STATIC_PLANNED: ProviderRegistryEntry[] = [
  {
    providerId: 'guide-plan-variants',
    kind: 'candidate',
    version: '1.0.0',
    outputSchemaId: 'tripnara.candidate_generation_result@v1',
    scenarios: ['guide_import', 'guide_canonical_selection'],
    status: 'ACTIVE',
    runtimeBound: false,
  },
  {
    providerId: 'agentic-research',
    kind: 'research',
    version: '0.1.0',
    outputSchemaId: 'tripnara.research_provider_result@v1',
    scenarios: ['agent_route_and_run'],
    status: 'ACTIVE',
    runtimeBound: false,
  },
  {
    providerId: 'agentic-narration',
    kind: 'narration',
    version: '0.1.0',
    outputSchemaId: 'tripnara.narration_provider_result@v1',
    scenarios: ['decision_center', 'agent_explain'],
    status: 'ACTIVE',
    runtimeBound: false,
  },
  {
    providerId: 'constraint-critic',
    kind: 'critic',
    version: '0.1.0',
    outputSchemaId: 'tripnara.critic_provider_result@v1',
    scenarios: ['plan_validation'],
    status: 'ACTIVE',
    runtimeBound: false,
  },
];

@Injectable()
export class DecisionProviderRegistryService {
  constructor(
    @Optional() private readonly legacyCandidate?: LegacyCandidateGenerationProvider,
    @Optional() private readonly neptuneRepair?: NeptuneRepairProvider,
    @Optional() private readonly constraintCritic?: ConstraintCriticProvider,
    @Optional() private readonly agenticResearch?: AgenticResearchProvider,
    @Optional() private readonly agenticNarration?: AgenticNarrationProvider,
  ) {}

  list(): ProviderRegistryEntry[] {
    return this.snapshot().providers;
  }

  get(providerId: DecisionProviderId): ProviderRegistryEntry | undefined {
    return this.list().find((p) => p.providerId === providerId);
  }

  snapshot(): ProviderRegistrySnapshot {
    const bound: ProviderRegistryEntry[] = [];

    if (this.legacyCandidate) {
      bound.push({
        providerId: this.legacyCandidate.providerId,
        kind: 'candidate',
        version: '1.0.0',
        outputSchemaId: 'tripnara.candidate_generation_result@v1',
        scenarios: ['full_plan_selection', 'multi_plan_generator', 'benchmark'],
        status: 'ACTIVE',
        runtimeBound: true,
      });
    }

    if (this.neptuneRepair) {
      bound.push({
        providerId: this.neptuneRepair.providerId,
        kind: 'repair',
        version: '1.0.0',
        outputSchemaId: 'tripnara.repair_provider_result@v1',
        scenarios: ['road_segment_unavailable', 'guardian_l2_evaluate'],
        status: 'ACTIVE',
        runtimeBound: true,
      });
    }

    if (this.constraintCritic) {
      bound.push({
        providerId: this.constraintCritic.providerId,
        kind: 'critic',
        version: '0.1.0',
        outputSchemaId: 'tripnara.critic_provider_result@v1',
        scenarios: ['plan_validation', 'canonical_l2_evaluate'],
        status: 'ACTIVE',
        runtimeBound: true,
      });
    }

    if (this.agenticResearch) {
      bound.push({
        providerId: this.agenticResearch.providerId,
        kind: 'research',
        version: '0.1.0',
        outputSchemaId: 'tripnara.research_provider_result@v1',
        scenarios: ['agent_route_and_run'],
        status: 'ACTIVE',
        runtimeBound: true,
      });
    }

    if (this.agenticNarration) {
      bound.push({
        providerId: this.agenticNarration.providerId,
        kind: 'narration',
        version: '0.1.0',
        outputSchemaId: 'tripnara.narration_provider_result@v1',
        scenarios: ['decision_center', 'agent_explain'],
        status: 'ACTIVE',
        runtimeBound: true,
      });
    }

    const boundIds = new Set(bound.map((p) => p.providerId));
    const staticEntries = STATIC_PLANNED.filter((p) => !boundIds.has(p.providerId));

    return {
      schemaId: 'tripnara.decision_provider_registry@v1',
      registryVersion: PROVIDER_REGISTRY_VERSION,
      generatedAt: new Date().toISOString(),
      providers: [...bound, ...staticEntries],
    };
  }
}
