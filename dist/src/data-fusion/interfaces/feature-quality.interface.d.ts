export type FeatureQualityLevel = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
export interface FeatureQualityReport {
    featureName: string;
    featureValue: any;
    overallQuality: number;
    qualityLevel: FeatureQualityLevel;
    reliability: number;
    completeness: number;
    timeliness: number;
    traceability: number;
    consistency: number;
    issues: Array<{
        type: 'RELIABILITY' | 'COMPLETENESS' | 'TIMELINESS' | 'TRACEABILITY' | 'CONSISTENCY';
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        description: string;
        recommendation?: string;
    }>;
    recommendations: string[];
    assessedAt: string;
}
export interface FeatureQualityAssessmentConfig {
    reliabilityWeight?: number;
    completenessWeight?: number;
    timelinessWeight?: number;
    traceabilityWeight?: number;
    consistencyWeight?: number;
    reliabilityThreshold?: number;
    completenessThreshold?: number;
    timelinessThresholdSeconds?: number;
    enableDetailedAssessment?: boolean;
}
