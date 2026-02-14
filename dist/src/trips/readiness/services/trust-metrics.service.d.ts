import { ReadinessCheckResult, TrustMetrics } from '../types/readiness-findings.types';
export declare class TrustMetricsService {
    private readonly logger;
    calculateTrustMetrics(result: ReadinessCheckResult, lang?: 'en' | 'zh'): TrustMetrics;
    private calculateCapabilityTrust;
    private calculateBenevolenceTrust;
    private calculatePredictabilityTrust;
    private evaluateDataSourceReliability;
    private evaluateGeoFeaturesQuality;
    private evaluateRuleAccuracy;
    private evaluateEvidenceQuality;
    private evaluateSafetyFocus;
    private evaluateUserBenefit;
    private evaluateTransparency;
    private evaluateRuleTransparency;
    private evaluateConsistency;
    private evaluateExplainability;
}
