import { FeatureQualityReport, FeatureQualityAssessmentConfig } from '../interfaces/feature-quality.interface';
import { DataSourceConfig } from '../interfaces/data-fusion.interface';
export declare class FeatureQualityAssessmentService {
    private readonly logger;
    private readonly assessmentCache;
    private readonly CACHE_TTL;
    private readonly defaultConfig;
    assessFeatureQuality(featureName: string, featureValue: any, sourceData: DataSourceConfig[], config?: FeatureQualityAssessmentConfig): Promise<FeatureQualityReport>;
    assessMultipleFeatures(features: Array<{
        name: string;
        value: any;
    }>, sourceData: DataSourceConfig[], config?: FeatureQualityAssessmentConfig): Promise<Map<string, FeatureQualityReport>>;
    private generateCacheKey;
    private cleanExpiredCache;
    private assessReliability;
    private assessCompleteness;
    private assessTimeliness;
    private assessTraceability;
    private assessConsistency;
    private calculateSourceConsistency;
    private calculateStandardDeviation;
    private assessValueReasonableness;
    private calculateValueConsistency;
    private calculateStringSimilarity;
    private calculateOverallQuality;
    private determineQualityLevel;
    private identifyIssues;
    private generateRecommendations;
    private hasFeature;
}
