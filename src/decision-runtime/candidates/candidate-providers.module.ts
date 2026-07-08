import { Module } from '@nestjs/common';
import { LegacyTripPlanningAdapter } from './legacy-planning.adapter';
import { LegacyCandidateGenerationProvider } from './providers/legacy-candidate-generation.provider';
import { NeptuneRepairProvider } from './providers/neptune-repair.provider';
import { ConstraintCriticProvider } from './providers/constraint-critic.provider';
import { AgenticResearchProvider } from './providers/agentic-research.provider';
import { AgenticNarrationProvider } from './providers/agentic-narration.provider';
import { DecisionProviderRegistryService } from './decision-provider-registry.service';
import { DecisionProviderInvocationService } from './decision-provider-invocation.service';

@Module({
  providers: [
    LegacyTripPlanningAdapter,
    LegacyCandidateGenerationProvider,
    NeptuneRepairProvider,
    ConstraintCriticProvider,
    AgenticResearchProvider,
    AgenticNarrationProvider,
    DecisionProviderRegistryService,
    DecisionProviderInvocationService,
  ],
  exports: [
    LegacyTripPlanningAdapter,
    LegacyCandidateGenerationProvider,
    NeptuneRepairProvider,
    ConstraintCriticProvider,
    AgenticResearchProvider,
    AgenticNarrationProvider,
    DecisionProviderRegistryService,
    DecisionProviderInvocationService,
  ],
})
export class CandidateProvidersModule {}
