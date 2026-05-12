import { Module } from '@nestjs/common';
import { DecisionOSConfigService } from '../optimization/config';
import { PlanFeaturesService } from '../optimization/plan-features/plan-features.service';
import { ExposureMapService } from '../optimization/plan-features/exposure-map.service';
import { ExposureAnnotationService } from '../optimization/plan-features/exposure-annotation.service';
import { ExpectedUtilityService } from '../optimization/probabilistic/expected-utility.service';
import { ProbabilisticWorldModelService } from '../optimization/probabilistic/probabilistic-world-model.service';
import { UnifiedDecisionFormulaService } from '../optimization/unified-decision-formula.service';
import { CGUSSearchService } from '../optimization/cgus-search.service';
import { OptimizationEngineAdapterService } from '../../../decision/kernel/optimization-engine-adapter.service';
import { ObjectiveFunctionService } from '../optimization/objective-function.service';
import { FatigueCalculatorService } from '../services/fatigue-calculator.service';
import { RagRealityPolicyGateService } from '../../../rag/services/rag-reality-policy-gate.service';

/**
 * Minimal module for CGUS replay / regression runs.
 *
 * Goals:
 * - Avoid booting full AppModule (redis/mcp/direct services).
 * - Keep DI wiring for OptimizationEngineAdapterService + CGUS core stack.
 * - Leave ConstraintEngine optional (so replay can inject violations without being overwritten by empty checker state).
 */
@Module({
  providers: [
    // Typed config (env-driven defaults)
    {
      provide: DecisionOSConfigService,
      useFactory: () => new DecisionOSConfigService(),
    },

    // Core feature extraction / exposure
    PlanFeaturesService,
    ExposureMapService,
    ExposureAnnotationService,

    // Deterministic objective function (dependency of ExpectedUtilityService)
    FatigueCalculatorService,
    ObjectiveFunctionService,

    // Monte Carlo + rollout
    ExpectedUtilityService,
    ProbabilisticWorldModelService,

    // CGUS scoring/search
    UnifiedDecisionFormulaService,
    CGUSSearchService,

    RagRealityPolicyGateService,

    // Adapter entrypoint used by scripts
    OptimizationEngineAdapterService,
  ],
  exports: [OptimizationEngineAdapterService, DecisionOSConfigService],
})
export class CgusReplayModule {}

