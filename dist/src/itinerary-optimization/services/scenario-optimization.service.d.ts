import { PlanRequest } from '../interfaces/plan-request.interface';
import { ScenarioOptimizationConfig, ScenarioConstraints, OptimizationScenario } from '../interfaces/scenario-optimization.interface';
export declare class ScenarioOptimizationService {
    private readonly logger;
    applyScenarioConfig(request: PlanRequest, config: ScenarioOptimizationConfig): PlanRequest;
    private applyWalkingConfig;
    private applyDrivingConfig;
    private applyTransitConfig;
    generateScenarioConstraints(scenario: OptimizationScenario, config?: ScenarioOptimizationConfig): ScenarioConstraints;
    getDefaultScenarioConfig(scenario: OptimizationScenario): ScenarioOptimizationConfig;
}
