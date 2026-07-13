import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TripConstraintSolverModule } from '../../trips/trip-constraint-solver/trip-constraint-solver.module';
import { TepModule } from '../../trips/tep/tep.module';
import { UnifiedConstraintAssessmentService } from './services/unified-constraint-assessment.service';
import { UnifiedConstraintAssessmentController } from './controllers/unified-constraint-assessment.controller';

@Module({
  imports: [
    PrismaModule,
    TripConstraintSolverModule,
    forwardRef(() => TepModule),
  ],
  controllers: [UnifiedConstraintAssessmentController],
  providers: [UnifiedConstraintAssessmentService],
  exports: [UnifiedConstraintAssessmentService],
})
export class UnifiedConstraintAssessmentModule {}
