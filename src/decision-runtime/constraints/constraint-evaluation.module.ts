import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DecisionModule } from '../../trips/decision/decision.module';
import { TripConstraintSolverModule } from '../../trips/trip-constraint-solver/trip-constraint-solver.module';
import { DecisionSemanticsModule } from '../../trips/decision-semantics/decision-semantics.module';
import { PoiAccessCapacityModule } from '../../poi-access-capacity/poi-access-capacity.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConstraintEvaluationGatewayService } from './constraint-evaluation.gateway.service';
import { ConstraintFailurePolicyService } from './failure-policy.service';
import { ConstraintShadowMetricsService } from './constraint-shadow-metrics.service';
import { LegacyConstraintCheckerAdapter } from './providers/legacy-checker.provider';
import { GuardianConstraintProvider } from './providers/guardian-constraint.provider';
import { DestinationPackConstraintProvider } from './providers/destination-pack.provider';
import { UserConstraintProvider } from './providers/user-constraint.provider';
import { PoiAccessConstraintProvider } from './providers/poi-access-constraint.provider';
import { ScheduleConstraintProvider } from './providers/schedule-constraint.provider';
import { PlanObjectConstraintProvider } from './providers/plan-object-constraint.provider';
import { OntologyConstraintProvider } from './providers/ontology-constraint.provider';
import { ConstraintAssessmentTraceService } from './services/constraint-assessment-trace.service';
import { ConstraintAssessmentTraceController } from './controllers/constraint-assessment-trace.controller';
import { CandidateConstraintFacade } from './services/candidate-constraint-facade.service';
import { FeasibilityProjectionService } from './services/feasibility-projection.service';
import { GuardianFeasibilityCollectorService } from './services/guardian-feasibility-collector.service';
import { TripOntologyGatewayBridgeService } from './services/trip-ontology-gateway-bridge.service';
import { PlanObjectsModule } from '../plan-objects/plan-objects.module';
import { WorldStateSnapshotModule } from '../snapshot/world-state-snapshot.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    PoiAccessCapacityModule,
    PlanObjectsModule,
    forwardRef(() => DecisionModule),
    forwardRef(() => TripConstraintSolverModule),
    forwardRef(() => DecisionSemanticsModule),
    forwardRef(() => WorldStateSnapshotModule),
  ],
  controllers: [ConstraintAssessmentTraceController],
  providers: [
    ConstraintFailurePolicyService,
    LegacyConstraintCheckerAdapter,
    GuardianConstraintProvider,
    DestinationPackConstraintProvider,
    UserConstraintProvider,
    PoiAccessConstraintProvider,
    ScheduleConstraintProvider,
    PlanObjectConstraintProvider,
    OntologyConstraintProvider,
    ConstraintEvaluationGatewayService,
    ConstraintShadowMetricsService,
    ConstraintAssessmentTraceService,
    CandidateConstraintFacade,
    FeasibilityProjectionService,
    GuardianFeasibilityCollectorService,
    TripOntologyGatewayBridgeService,
  ],
  exports: [
    ConstraintEvaluationGatewayService,
    ConstraintShadowMetricsService,
    ConstraintAssessmentTraceService,
    CandidateConstraintFacade,
    FeasibilityProjectionService,
    GuardianFeasibilityCollectorService,
    PoiAccessConstraintProvider,
    ScheduleConstraintProvider,
    PlanObjectConstraintProvider,
    TripOntologyGatewayBridgeService,
  ],
})
export class ConstraintEvaluationModule {}
