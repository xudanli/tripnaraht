import { RiskQuantification } from '../types/readiness-findings.types';
import { HazardType, RuleSeverity } from '../types/readiness-pack.types';
import { TripContext } from '../types/trip-context.types';
export declare class RiskQuantificationService {
    private readonly logger;
    quantifyRisk(riskType: HazardType, severity: RuleSeverity, context?: TripContext, lang?: 'en' | 'zh'): RiskQuantification;
    private getBaseRiskScore;
    private calculateRiskMetrics;
    private quantifyWeatherRisk;
    private quantifyTerrainRisk;
    private quantifyWaterSafetyRisk;
    private quantifyWildlifeRisk;
    private quantifyHealthcareRisk;
    private quantifyLogisticsRisk;
    private quantifyCrimeRisk;
    private quantifyRegulatoryRisk;
    private estimateProbability;
    private getSeverityLabel;
}
