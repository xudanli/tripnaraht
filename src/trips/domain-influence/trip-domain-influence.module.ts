import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TripProcessFairnessModule } from '../process-fairness/trip-process-fairness.module';
import { TripDomainInfluenceController } from './trip-domain-influence.controller';
import { TripCollaborativeTasksController } from './trip-collaborative-tasks.controller';
import { TripDomainInfluenceService } from './services/trip-domain-influence.service';
import { TripDomainAccessService } from './services/trip-domain-access.service';

@Module({
  imports: [PrismaModule, TripProcessFairnessModule],
  controllers: [TripDomainInfluenceController, TripCollaborativeTasksController],
  providers: [TripDomainInfluenceService, TripDomainAccessService],
  exports: [TripDomainInfluenceService],
})
export class TripDomainInfluenceModule {}
