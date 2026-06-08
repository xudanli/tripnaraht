import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OdysseyIntakeModule } from '../odyssey-intake/odyssey-intake.module';
import { ReputationOsModule } from '../reputation-os/reputation-os.module';
import { LlmModule } from '../llm/llm.module';
import { HikingPlansModule } from '../hiking-plans/hiking-plans.module';
import { HikingDemoModule } from '../hiking-demo/hiking-demo.module';
import { AgentModule } from '../agent/agent.module';
import { MatchSquareController } from './match-square.controller';
import { MatchSquareService } from './match-square.service';
import { VibeLlmService } from './vibe-llm.service';
import { VibeLlmGateway } from './gateway/vibe-llm.gateway';
import { RouteDirectionsModule } from '../route-directions/route-directions.module';
import { TrekkingSpawnService } from './trekking-spawn.service';
import { TripInstantiationService } from './trip-instantiation.service';
import { CollaborativeTaskFlywheelService } from './collaborative-task-flywheel.service';
import { ActiveTripDecisionService } from './active-trip-decision.service';
import { ActiveTripDashboardService } from './active-trip-dashboard.service';
import { RouteContractLockService } from './route-contract-lock.service';
import { ActiveTripDecisionReplayService } from './active-trip-decision-replay.service';
import { RouteTemplateLaunchRecruitmentService } from './route-template-launch-recruitment.service';
import { CollaborativeTaskFlywheelController } from './collaborative-task-flywheel.controller';
import { DecisionModule } from '../trips/decision/decision.module';
import { TrekkingFitnessBaselineService } from './trekking-fitness-baseline.service';
import { TrekkingFitnessBackflowService } from './trekking-fitness-backflow.service';
import { SovereignForceLockService } from './sovereign-force-lock.service';
import { CollabFlywheelAuditService } from './observability/collaborative-flywheel-audit.service';

@Module({
  imports: [
    PrismaModule,
    OdysseyIntakeModule,
    ReputationOsModule,
    LlmModule,
    HikingPlansModule,
    HikingDemoModule,
    forwardRef(() => AgentModule),
    forwardRef(() => DecisionModule),
    RouteDirectionsModule,
  ],
  controllers: [MatchSquareController, CollaborativeTaskFlywheelController],
  providers: [
    MatchSquareService,
    VibeLlmService,
    VibeLlmGateway,
    TrekkingSpawnService,
    TripInstantiationService,
    CollaborativeTaskFlywheelService,
    ActiveTripDecisionService,
    ActiveTripDashboardService,
    RouteContractLockService,
    ActiveTripDecisionReplayService,
    RouteTemplateLaunchRecruitmentService,
    TrekkingFitnessBaselineService,
    TrekkingFitnessBackflowService,
    SovereignForceLockService,
    CollabFlywheelAuditService,
  ],
  exports: [
    MatchSquareService,
    VibeLlmService,
    TrekkingSpawnService,
    TripInstantiationService,
    CollaborativeTaskFlywheelService,
    ActiveTripDecisionService,
    ActiveTripDashboardService,
    RouteContractLockService,
    ActiveTripDecisionReplayService,
    RouteTemplateLaunchRecruitmentService,
    TrekkingFitnessBaselineService,
    TrekkingFitnessBackflowService,
    SovereignForceLockService,
    CollabFlywheelAuditService,
  ],
})
export class MatchSquareModule {}
