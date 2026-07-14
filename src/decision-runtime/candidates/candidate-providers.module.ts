import { Module } from '@nestjs/common';
import { LegacyTripPlanningAdapter } from './legacy-planning.adapter';
import { LegacyCandidateGenerationProvider } from './providers/legacy-candidate-generation.provider';
import { NeptuneRepairProvider } from './providers/neptune-repair.provider';
import { ConstraintCriticProvider } from './providers/constraint-critic.provider';
import { AgenticResearchProvider } from './providers/agentic-research.provider';
import { AgenticNarrationProvider } from './providers/agentic-narration.provider';
import { DecisionProviderRegistryService } from './decision-provider-registry.service';
import { DecisionProviderInvocationService } from './decision-provider-invocation.service';
import { SolverModule } from '../solver/solver.module';
import { OrToolsRepairShadowService } from '../solver/shadow/ortools-repair-shadow.service';

@Module({
  imports: [SolverModule],
  providers: [
    LegacyTripPlanningAdapter,
    LegacyCandidateGenerationProvider,
    NeptuneRepairProvider,
    ConstraintCriticProvider,
    AgenticResearchProvider,
    AgenticNarrationProvider,
    DecisionProviderRegistryService,
    DecisionProviderInvocationService,
    OrToolsRepairShadowService,
  ],
  exports: [
    LegacyTripPlanningAdapter,
    LegacyCandidateGenerationProvider,
    NeptuneRepairProvider,
    OrToolsRepairShadowService,
    ConstraintCriticProvider,
    AgenticResearchProvider,
    AgenticNarrationProvider,
    DecisionProviderRegistryService,
    DecisionProviderInvocationService,
    // Re-exports OrToolsRepairProvider (+ shadow bridges / client)
    SolverModule,
  ],
})
export class CandidateProvidersModule {}
