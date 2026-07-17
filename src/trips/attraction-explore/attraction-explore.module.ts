import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TransportModule } from '../../transport/transport.module';
import { LlmModule } from '../../llm/llm.module';
import { AttractionExploreController } from './attraction-explore.controller';
import { AttractionExploreAccessService } from './services/attraction-explore-access.service';
import { AttractionExploreContextService } from './services/attraction-explore-context.service';
import { AttractionExploreCandidateService } from './services/attraction-explore-candidate.service';
import { AttractionExploreRecommendationsService } from './services/attraction-explore-recommendations.service';
import { AttractionExploreSeedService } from './services/attraction-explore-seed.service';
import { AttractionExploreMapService } from './services/attraction-explore-map.service';
import { AttractionExploreAutoArrangeService } from './services/attraction-explore-auto-arrange.service';
import { AttractionExploreAiConsultService } from './services/attraction-explore-ai-consult.service';
import { AttractionExploreOrchestratorService } from './services/attraction-explore-orchestrator.service';
import { AttractionExploreCandidatePrecheckService } from './services/attraction-explore-candidate-precheck.service';
import { AttractionExploreRouteDetourService } from './services/attraction-explore-route-detour.service';
import { AttractionExploreIntentCompileService } from './services/attraction-explore-intent-compile.service';
import { PlanningLodgingWorkbenchService } from './services/planning-lodging-workbench.service';

@Module({
  imports: [PrismaModule, TransportModule, forwardRef(() => LlmModule)],
  controllers: [AttractionExploreController],
  providers: [
    AttractionExploreAccessService,
    AttractionExploreContextService,
    AttractionExploreCandidateService,
    AttractionExploreRecommendationsService,
    AttractionExploreSeedService,
    AttractionExploreMapService,
    AttractionExploreAutoArrangeService,
    AttractionExploreAiConsultService,
    AttractionExploreOrchestratorService,
    AttractionExploreCandidatePrecheckService,
    AttractionExploreRouteDetourService,
    AttractionExploreIntentCompileService,
    PlanningLodgingWorkbenchService,
  ],
  exports: [
    AttractionExploreSeedService,
    AttractionExploreCandidateService,
    AttractionExploreAccessService,
    AttractionExploreContextService,
    AttractionExploreAiConsultService,
    AttractionExploreAutoArrangeService,
    AttractionExploreRouteDetourService,
    AttractionExploreIntentCompileService,
    AttractionExploreMapService,
    AttractionExploreRecommendationsService,
    AttractionExploreOrchestratorService,
    PlanningLodgingWorkbenchService,
  ],
})
export class AttractionExploreModule {}
