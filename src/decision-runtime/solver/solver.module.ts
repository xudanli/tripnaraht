import { Module, forwardRef } from '@nestjs/common';
import { OrToolsSolverClient } from './ortools-solver.client';
import { OptimizationProblemMapper } from './mappers/optimization-problem.mapper';
import { SolverCandidateMapper } from './mappers/solver-candidate.mapper';
import { OrToolsRepairProvider } from './providers/ortools-repair.provider';
import { OrToolsRoadEvaluateShadowBridge } from './bridge/ortools-road-evaluate-shadow.bridge';
import { OrToolsPlanningOrchestratorShadowBridge } from './bridge/ortools-planning-orchestrator-shadow.bridge';
import { ConstraintEvaluationModule } from '../constraints/constraint-evaluation.module';
import { OrToolsShadowMetricsCollector } from './observability/ortools-shadow-metrics.collector';
import { OrToolsCanaryDashboardCollector } from './observability/ortools-canary-dashboard.metrics';
import { OrToolsShadowOpsController } from './controllers/ortools-shadow-ops.controller';

/** OR-Tools client + repair provider + evaluate/planning shadow bridges. */
@Module({
  imports: [forwardRef(() => ConstraintEvaluationModule)],
  controllers: [OrToolsShadowOpsController],
  providers: [
    OrToolsSolverClient,
    OptimizationProblemMapper,
    SolverCandidateMapper,
    OrToolsRepairProvider,
    OrToolsShadowMetricsCollector,
    OrToolsCanaryDashboardCollector,
    OrToolsRoadEvaluateShadowBridge,
    OrToolsPlanningOrchestratorShadowBridge,
  ],
  exports: [
    OrToolsSolverClient,
    OptimizationProblemMapper,
    SolverCandidateMapper,
    OrToolsRepairProvider,
    OrToolsShadowMetricsCollector,
    OrToolsCanaryDashboardCollector,
    OrToolsRoadEvaluateShadowBridge,
    OrToolsPlanningOrchestratorShadowBridge,
  ],
})
export class SolverModule {}
