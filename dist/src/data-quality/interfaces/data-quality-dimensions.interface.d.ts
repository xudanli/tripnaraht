export interface CompletenessMetric {
    definition: string;
    calculation: string;
    target: string;
    measurementFrequency: string;
    currentValue: number;
    missingFields: string[];
    completeFields: string[];
    totalFields: number;
    validRecords: number;
    totalRecords: number;
}
export interface AccuracyMetric {
    definition: string;
    calculation: string;
    target: string;
    measurementFrequency: string;
    currentValue: number;
    correctData: number;
    totalData: number;
    errors: Array<{
        field: string;
        expected?: any;
        actual: any;
        errorType: 'format' | 'range' | 'logic' | 'reference';
    }>;
}
export interface ConsistencyMetric {
    definition: string;
    calculation: string;
    target: string;
    measurementFrequency: string;
    currentValue: number;
    consistentData: number;
    totalData: number;
    inconsistencies: Array<{
        field: string;
        sources: Array<{
            source: string;
            value: any;
            timestamp?: string;
        }>;
        conflictType: 'value' | 'format' | 'schema';
    }>;
}
export interface TimelinessMetric {
    definition: string;
    calculation: string;
    target: string;
    measurementFrequency: string;
    currentValue: number;
    timelyData: number;
    totalData: number;
    staleData: Array<{
        field: string;
        lastUpdated: string;
        ageSeconds: number;
        maxAgeSeconds: number;
        source: string;
    }>;
}
export interface TraceabilityMetric {
    definition: string;
    calculation: string;
    target: string;
    measurementFrequency: string;
    currentValue: number;
    traceableData: number;
    totalData: number;
    untraceableData: Array<{
        field: string;
        missingInfo: string[];
    }>;
}
export interface DataQualityAssessment {
    timestamp: string;
    dataId?: string;
    dataType?: string;
    completeness: CompletenessMetric;
    accuracy: AccuracyMetric;
    consistency: ConsistencyMetric;
    timeliness: TimelinessMetric;
    traceability: TraceabilityMetric;
    overallScore: number;
    qualityLevel: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
    recommendations: string[];
}
export interface DataSourceInfo {
    sourceId: string;
    sourceName: string;
    sourceType: 'api' | 'database' | 'user_input' | 'inferred' | 'external' | 'cache';
    timestamp: string;
    version?: string;
    provider?: string;
    confidence?: number;
    metadata?: Record<string, any>;
}
export interface AnnotatedData {
    value: any;
    source: DataSourceInfo;
    quality?: {
        completeness?: number;
        accuracy?: number;
        consistency?: number;
        timeliness?: number;
        traceability?: number;
    };
}
