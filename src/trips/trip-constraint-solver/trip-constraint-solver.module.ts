import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TransportModule } from '../../transport/transport.module';
import { ReadinessModule } from '../readiness/readiness.module';
import { InTripExecutionModule } from '../in-trip-execution/in-trip-execution.module';
import { OptimizationModule } from '../decision/optimization/optimization.module';
import { SkillsModule } from '../../skills/skills.module';
import { LoopsModule } from '../../loops/loops.module';
import { TripConflictsService } from '../services/trip-conflicts.service';
import { FeasibilityReportController } from './controllers/feasibility-report.controller';
import { ExecutionAdvisoryController } from './controllers/execution-advisory.controller';
import { ConstraintSolverAccessService } from './services/constraint-solver-access.service';
import { FeasibilityReportService } from './services/feasibility-report.service';
import { FeasibilityPomdpMonteCarloService } from './services/feasibility-pomdp-monte-carlo.service';
import { TeamFitAssessmentService } from './services/team-fit-assessment.service';
import { ExecutionAdvisoryService } from './services/execution-advisory.service';

@Module({
  imports: [
    PrismaModule,
    TransportModule,
    ReadinessModule,
    forwardRef(() => InTripExecutionModule),
    OptimizationModule,
    forwardRef(() => SkillsModule),
    forwardRef(() => LoopsModule),
  ],
  controllers: [FeasibilityReportController, ExecutionAdvisoryController],
  providers: [
    ConstraintSolverAccessService,
    FeasibilityReportService,
    FeasibilityPomdpMonteCarloService,
    TeamFitAssessmentService,
    ExecutionAdvisoryService,
    TripConflictsService,
  ],
  exports: [FeasibilityReportService, ExecutionAdvisoryService, ConstraintSolverAccessService],
})
export class TripConstraintSolverModule {}
