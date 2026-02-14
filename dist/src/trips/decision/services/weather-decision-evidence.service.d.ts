import { WeatherEvidencePipelineResult, WeatherDecisionRules } from '../interfaces/weather-decision-evidence.interface';
import { TripPlan } from '../plan-model';
export declare class WeatherDecisionEvidenceService {
    private readonly logger;
    generateEvidencePipeline(plan: TripPlan, rules?: WeatherDecisionRules): Promise<WeatherEvidencePipelineResult>;
    private generateDayEvidence;
    private checkViolations;
    private calculateCrosswindRisk;
    private generateExplanation;
    private suggestAction;
    private generateExplainableFailure;
    validatePlanHasWeatherEvidence(plan: TripPlan, evidenceResult: WeatherEvidencePipelineResult): {
        valid: boolean;
        reason?: string;
    };
    private getMockWeather;
}
