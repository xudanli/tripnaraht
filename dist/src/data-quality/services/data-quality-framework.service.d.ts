import { DataQualityAssessment, CompletenessMetric, AccuracyMetric, ConsistencyMetric, TimelinessMetric, TraceabilityMetric, DataSourceInfo } from '../interfaces/data-quality-dimensions.interface';
export declare class DataQualityFrameworkService {
    private readonly logger;
    assessCompleteness(data: any, requiredFields: string[], optionalFields?: string[]): CompletenessMetric;
    assessAccuracy(data: any, validationRules?: Record<string, (value: any) => boolean>, referenceData?: any): AccuracyMetric;
    assessConsistency(dataSources: Array<{
        source: string;
        data: any;
        timestamp?: string;
    }>): ConsistencyMetric;
    assessTimeliness(data: any, maxAgeSeconds?: Record<string, number>, defaultMaxAgeSeconds?: number): TimelinessMetric;
    assessTraceability(data: any, sourceInfo?: DataSourceInfo | Record<string, DataSourceInfo>): TraceabilityMetric;
    assessOverallQuality(data: any, options?: {
        requiredFields?: string[];
        optionalFields?: string[];
        validationRules?: Record<string, (value: any) => boolean>;
        referenceData?: any;
        dataSources?: Array<{
            source: string;
            data: any;
            timestamp?: string;
        }>;
        maxAgeSeconds?: Record<string, number>;
        defaultMaxAgeSeconds?: number;
        sourceInfo?: DataSourceInfo | Record<string, DataSourceInfo>;
        weights?: {
            completeness?: number;
            accuracy?: number;
            consistency?: number;
            timeliness?: number;
            traceability?: number;
        };
    }): Promise<DataQualityAssessment>;
    private isFieldMissing;
    private getFieldValue;
    private valuesMatch;
    private extractFields;
    private isRecord;
    private hasCompleteSourceInfo;
    private getMissingSourceInfo;
}
