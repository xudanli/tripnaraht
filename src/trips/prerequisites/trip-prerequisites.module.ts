import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PoiAccessCapacityModule } from '../../poi-access-capacity/poi-access-capacity.module';
import { ConstraintSolverAccessService } from '../trip-constraint-solver/services/constraint-solver-access.service';
import { TripPrerequisiteController } from './controllers/trip-prerequisite.controller';
import { TripPrerequisiteService } from './services/trip-prerequisite.service';

@Module({
  imports: [PrismaModule, PoiAccessCapacityModule],
  controllers: [TripPrerequisiteController],
  providers: [TripPrerequisiteService, ConstraintSolverAccessService],
  exports: [TripPrerequisiteService],
})
export class TripPrerequisitesModule {}
