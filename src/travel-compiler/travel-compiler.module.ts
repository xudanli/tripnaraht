import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { CanonicalPoiResolutionModule } from '../canonical-poi-resolution/canonical-poi-resolution.module';
import { ConstraintEvaluationModule } from '../decision-runtime/constraints/constraint-evaluation.module';
import { TripConstraintSolverModule } from '../trips/trip-constraint-solver/trip-constraint-solver.module';
import { EffectivePlanExecutionModule } from '../decision-runtime/execution/effective-plan-execution.module';
import { TravelCompilerController } from './travel-compiler.controller';
import { TravelGraphController } from './travel-graph.controller';
import { TravelCompilerService } from './travel-compiler.service';
import { TravelGraphStoreService } from './services/travel-graph-store.service';
import { GraphEffectivePlanMaterializerService } from './services/graph-effective-plan-materializer.service';
import { CtreController } from './ctre.controller';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    CanonicalPoiResolutionModule,
    forwardRef(() => ConstraintEvaluationModule),
    forwardRef(() => TripConstraintSolverModule),
    EffectivePlanExecutionModule,
  ],
  controllers: [TravelCompilerController, TravelGraphController, CtreController],
  providers: [TravelCompilerService, TravelGraphStoreService, GraphEffectivePlanMaterializerService],
  exports: [TravelCompilerService, TravelGraphStoreService, GraphEffectivePlanMaterializerService],
})
export class TravelCompilerModule {}
