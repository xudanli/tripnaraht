import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DecisionGatewayModule } from '../gateway/decision-gateway.module';
import { WorldStateSnapshotModule } from '../snapshot/world-state-snapshot.module';
import { TripConstraintSolverModule } from '../../trips/trip-constraint-solver/trip-constraint-solver.module';
import { DecisionTriggerModule } from './decision-trigger.module';
import { TripIntentController } from './intent/trip-intent.controller';
import { TripIntentRouterService } from './intent/trip-intent-router.service';

@Module({
  imports: [
    PrismaModule,
    DecisionTriggerModule,
    WorldStateSnapshotModule,
    TripConstraintSolverModule,
    forwardRef(() => DecisionGatewayModule),
  ],
  controllers: [TripIntentController],
  providers: [TripIntentRouterService],
  exports: [TripIntentRouterService],
})
export class TripIntentModule {}
