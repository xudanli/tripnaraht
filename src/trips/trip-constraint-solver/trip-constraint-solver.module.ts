import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TransportModule } from '../../transport/transport.module';
import { ReadinessModule } from '../readiness/readiness.module';
import { InTripExecutionModule } from '../in-trip-execution/in-trip-execution.module';
import { OptimizationModule } from '../decision/optimization/optimization.module';
import { SkillsModule } from '../../skills/skills.module';
import { LoopsModule } from '../../loops/loops.module';
import { PoiAccessCapacityModule } from '../../poi-access-capacity/poi-access-capacity.module';
import { TripPrerequisitesModule } from '../prerequisites/trip-prerequisites.module';
import { CausalProtocolModule } from '../../causal-protocol/causal-protocol.module';
import { TripConflictsService } from '../services/trip-conflicts.service';
import { FeasibilityReportController } from './controllers/feasibility-report.controller';
import { PreTripReadinessP0Controller } from './controllers/pre-trip-readiness-p0.controller';
import { ExecutionAdvisoryController } from './controllers/execution-advisory.controller';
import { PlanningConflictsController } from './controllers/planning-conflicts.controller';
import { DecisionCheckerController } from './controllers/decision-checker.controller';
import { DepartureGateController } from './controllers/departure-gate.controller';
import { DepartureGateService } from './services/departure-gate.service';
import { TripWishModule } from '../wishlist/trip-wish.module';
import { ConstraintsSummaryController, ConstraintsLegacyController } from './controllers/constraints.controller';
import { TripConstraintsController } from './controllers/trip-constraints.controller';
import { PlanningCommandsController } from './controllers/planning-commands.controller';
import { SplitPlanController } from './controllers/split-plan.controller';
import { ConstraintSolverAccessService } from './services/constraint-solver-access.service';
import { FeasibilityReportService } from './services/feasibility-report.service';
import { FeasibilityPomdpMonteCarloService } from './services/feasibility-pomdp-monte-carlo.service';
import { TeamFitAssessmentService } from './services/team-fit-assessment.service';
import { PreTripReadinessP0Service } from './services/pre-trip-readiness-p0.service';
import { ExperienceRegretBoundService } from './services/experience-regret-bound.service';
import { ExecutionAdvisoryService } from './services/execution-advisory.service';
import { ExecutionCausalInsightService } from './services/execution-causal-insight.service';
import { ExecutionAdvisoryApplyService } from './services/execution-advisory-apply.service';
import { PlanningConflictsService } from './services/planning-conflicts.service';
import { DecisionCheckerService } from './services/decision-checker.service';
import { SplitPlanService } from './services/split-plan.service';
import { ApplyRelaxationConstraintsService } from './services/apply-relaxation-constraints.service';
import { TripConstraintRegistryService } from './services/trip-constraint-registry.service';
import { TripConstraintCommandsService } from './services/trip-constraint-commands.service';
import { TripConstraintPreviewService } from './services/trip-constraint-preview.service';
import { ConstraintsSummaryService } from './services/constraints-summary.service';
import { TripBudgetOsModule } from '../budget-os/budget-os.module';
import { EffectivePlanExecutionModule } from '../../decision-runtime/execution/effective-plan-execution.module';

@Module({
  imports: [
    PrismaModule,
    TransportModule,
    ReadinessModule,
    PoiAccessCapacityModule,
    TripPrerequisitesModule,
    TripBudgetOsModule,
    EffectivePlanExecutionModule,
    TripWishModule,
    CausalProtocolModule,
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
    DecisionCheckerController,
    ConstraintsSummaryController,
    ConstraintsLegacyController,
    TripConstraintsController,
    PlanningCommandsController,
    SplitPlanController,
    DepartureGateController,
  ],
  providers: [
    ConstraintSolverAccessService,
    FeasibilityReportService,
    PreTripReadinessP0Service,
    ExperienceRegretBoundService,
    FeasibilityPomdpMonteCarloService,
    TeamFitAssessmentService,
    ExecutionAdvisoryService,
    ExecutionCausalInsightService,
    ExecutionAdvisoryApplyService,
    TripConflictsService,
    PlanningConflictsService,
    DecisionCheckerService,
    SplitPlanService,
    ConstraintsSummaryService,
    ApplyRelaxationConstraintsService,
    TripConstraintRegistryService,
    TripConstraintPreviewService,
    TripConstraintCommandsService,
    DepartureGateService,
  ],
  exports: [
    FeasibilityReportService,
    DepartureGateService,
    PreTripReadinessP0Service,
    ExecutionAdvisoryService,
    ConstraintSolverAccessService,
    PlanningConflictsService,
    DecisionCheckerService,
    SplitPlanService,
    ConstraintsSummaryService,
    ApplyRelaxationConstraintsService,
    TripConstraintRegistryService,
    TripConstraintPreviewService,
    TripConstraintCommandsService,
  ],
})
export class TripConstraintSolverModule {}
