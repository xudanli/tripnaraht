import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TransportModule } from '../../transport/transport.module';
import { ReadinessModule } from '../readiness/readiness.module';
import { InTripExecutionModule } from '../in-trip-execution/in-trip-execution.module';
import { OptimizationModule } from '../decision/optimization/optimization.module';
import { SkillsModule } from '../../skills/skills.module';
import { LoopsModule } from '../../loops/loops.module';
import { PoiAccessCapacityModule } from '../../poi-access-capacity/poi-access-capacity.module';
import { TripConflictsService } from '../services/trip-conflicts.service';
import { FeasibilityReportController } from './controllers/feasibility-report.controller';
import { PreTripReadinessP0Controller } from './controllers/pre-trip-readiness-p0.controller';
import { ExecutionAdvisoryController } from './controllers/execution-advisory.controller';
import { PlanningConflictsController } from './controllers/planning-conflicts.controller';
import { ConstraintsSummaryController, ConstraintsLegacyController } from './controllers/constraints.controller';
import { ConstraintSolverAccessService } from './services/constraint-solver-access.service';
import { FeasibilityReportService } from './services/feasibility-report.service';
import { FeasibilityPomdpMonteCarloService } from './services/feasibility-pomdp-monte-carlo.service';
import { TeamFitAssessmentService } from './services/team-fit-assessment.service';
import { PreTripReadinessP0Service } from './services/pre-trip-readiness-p0.service';
import { ExperienceRegretBoundService } from './services/experience-regret-bound.service';
import { ExecutionAdvisoryService } from './services/execution-advisory.service';
import { PlanningConflictsService } from './services/planning-conflicts.service';
import { ApplyRelaxationConstraintsService } from './services/apply-relaxation-constraints.service';
import { ConstraintsSummaryService } from './services/constraints-summary.service';
import { TripBudgetOsModule } from '../budget-os/budget-os.module';

@Module({
  imports: [
    PrismaModule,
    TransportModule,
    ReadinessModule,
    PoiAccessCapacityModule,
    TripBudgetOsModule,
    forwardRef(() => InTripExecutionModule),
    OptimizationModule,
    forwardRef(() => SkillsModule),
    forwardRef(() => LoopsModule),
  ],
  controllers: [
    FeasibilityReportController,
    PreTripReadinessP0Controller,
    ExecutionAdvisoryController,
    PlanningConflictsController,
    ConstraintsSummaryController,
    ConstraintsLegacyController,
  ],
  providers: [
    ConstraintSolverAccessService,
    FeasibilityReportService,
    PreTripReadinessP0Service,
    ExperienceRegretBoundService,
    FeasibilityPomdpMonteCarloService,
    TeamFitAssessmentService,
    ExecutionAdvisoryService,
    TripConflictsService,
    PlanningConflictsService,
    ConstraintsSummaryService,
    ApplyRelaxationConstraintsService,
  ],
  exports: [
    FeasibilityReportService,
    ExecutionAdvisoryService,
    ConstraintSolverAccessService,
    PlanningConflictsService,
    ConstraintsSummaryService,
    ApplyRelaxationConstraintsService,
  ],
})
export class TripConstraintSolverModule {}
