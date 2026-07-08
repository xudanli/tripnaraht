import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TripConstraintSolverModule } from '../../trips/trip-constraint-solver/trip-constraint-solver.module';
import { TravelStatusModule } from '../../trips/travel-status/travel-status.module';
import { AutomationAuthorizationController } from './automation-authorization.controller';
import { AutomationAuthorizationService } from './automation-authorization.service';
import { UserAutomationTemplateStore } from './user-automation-template.store';

@Module({
  imports: [PrismaModule, TripConstraintSolverModule, TravelStatusModule],
  controllers: [AutomationAuthorizationController],
  providers: [AutomationAuthorizationService, UserAutomationTemplateStore],
  exports: [AutomationAuthorizationService, UserAutomationTemplateStore],
})
export class AutomationAuthorizationModule {}
