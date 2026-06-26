import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { DecisionRuntimeModule } from '../decision-runtime/decision-runtime.module';
import { Gate1ProjectController, Gate1MetricsController } from './controllers/gate1-project.controller';
import { Gate1ParticipantController } from './controllers/gate1-participant.controller';
import { Gate1AdvisorController } from './controllers/gate1-advisor.controller';
import { Gate1OpsController } from './controllers/gate1-ops.controller';
import { Gate1ProjectService, Gate1BaselineService } from './services/gate1-project.service';
import { Gate1ParticipantService } from './services/gate1-participant.service';
import { Gate1ParticipantPortalService } from './services/gate1-participant-portal.service';
import { Gate1ParticipantTaskService } from './services/gate1-participant-task.service';
import { Gate1ChangeNoticeService } from './services/gate1-change-notice.service';
import { Gate1PrivacyService } from './services/gate1-privacy.service';
import { Gate1ConflictService, Gate1CandidateService } from './services/gate1-output.services';
import { Gate1DecisionService } from './services/gate1-decision.service';
import { Gate1ReadinessService } from './services/gate1-readiness.service';
import { Gate1PlanBService } from './services/gate1-plan-b.service';
import { Gate1OutcomeService } from './services/gate1-outcome.service';
import { Gate1CryptoService } from './services/gate1-crypto.service';
import { Gate1AnalyticsService, Gate1GuardService } from './services/gate1-support.services';
import { Gate1ProjectFitBridgeService } from './services/gate1-project-fit-bridge.service';
import { Gate1ParticipantNotificationService } from './services/gate1-participant-notification.service';
import { Gate1IdentityEventListener } from './listeners/gate1-identity-event.listener';
import { Gate1AdvisorWorkspaceService } from './services/gate1-advisor-workspace.service';
import { Gate1TrustSurfaceService } from './services/gate1-trust-surface.service';
import { Gate1AccessService } from './services/gate1-access.service';
import { Gate1AdvisorAccessGuard } from './guards/gate1-advisor-access.guard';
import { Gate1OpsAccessGuard } from './guards/gate1-ops-access.guard';
import { Gate1ParticipantReminderService } from './services/gate1-participant-reminder.service';
import { Gate1ParticipantReminderScheduler } from './schedulers/gate1-participant-reminder.scheduler';
import { Gate1RuntimeCommandHandler } from './commands/gate1-runtime-command.handler';
import { ContingencyAdvisorPlanBHandler } from '../decision/contingency/handlers/contingency-advisor-plan-b.handler';
import { ContingencyGate1Bootstrap } from '../decision/contingency/contingency-gate1.bootstrap';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule, EventEmitterModule, DecisionRuntimeModule],
  controllers: [
    Gate1ProjectController,
    Gate1MetricsController,
    Gate1ParticipantController,
    Gate1AdvisorController,
    Gate1OpsController,
  ],
  providers: [
    Gate1ProjectService,
    Gate1BaselineService,
    Gate1ParticipantService,
    Gate1ParticipantPortalService,
    Gate1ParticipantTaskService,
    Gate1ChangeNoticeService,
    Gate1PrivacyService,
    Gate1ConflictService,
    Gate1CandidateService,
    Gate1DecisionService,
    Gate1ReadinessService,
    Gate1PlanBService,
    Gate1OutcomeService,
    Gate1CryptoService,
    Gate1AnalyticsService,
    Gate1GuardService,
    Gate1ProjectFitBridgeService,
    Gate1ParticipantNotificationService,
    Gate1IdentityEventListener,
    Gate1ParticipantReminderService,
    Gate1ParticipantReminderScheduler,
    Gate1AdvisorWorkspaceService,
    Gate1TrustSurfaceService,
    Gate1AccessService,
    Gate1AdvisorAccessGuard,
    Gate1OpsAccessGuard,
    Gate1RuntimeCommandHandler,
    ContingencyAdvisorPlanBHandler,
    ContingencyGate1Bootstrap,
  ],
  exports: [
    Gate1ProjectService,
    Gate1AnalyticsService,
    Gate1GuardService,
    Gate1ProjectFitBridgeService,
    Gate1ParticipantNotificationService,
  ],
})
export class Gate1Module {}
