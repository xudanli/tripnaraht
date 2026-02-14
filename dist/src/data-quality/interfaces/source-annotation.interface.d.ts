export type VerificationLevel = 'A_VERIFIED' | 'B_RELIABLE' | 'C_USER_FEEDBACK' | 'D_PENDING' | 'E_LLM_GENERATED';
export type DataSourceType = 'DEM' | 'TRANSPORT' | 'POI' | 'WEATHER' | 'ROUTE' | 'OPENING_HOURS' | 'USER_INPUT' | 'LLM_GENERATED' | 'ESTIMATED' | 'DEFAULT' | 'OTHER';
export type DataSource = 'API' | 'CACHE' | 'DATABASE' | 'ESTIMATED' | 'DEFAULT' | 'USER_INPUT' | 'LLM_GENERATED' | 'EXTERNAL_API' | 'SENSOR' | 'THIRD_PARTY';
export interface ExtendedDataSourceInfo {
    type: DataSourceType;
    timestamp: string;
    expiry?: string;
    reliability: 'HIGH' | 'MEDIUM' | 'LOW';
    source: DataSource;
    sourceUrl?: string;
    sourceName: string;
    confidence: number;
    verificationLevel: VerificationLevel;
    crossValidationCount?: number;
    lastVerifiedAt?: string;
    isFactual: boolean;
    metadata?: Record<string, any>;
}
export interface SourceAnnotatedData {
    value: any;
    fieldName: string;
    source: ExtendedDataSourceInfo;
    quality?: {
        completeness?: number;
        accuracy?: number;
        consistency?: number;
        timeliness?: number;
        traceability?: number;
    };
}
export interface BatchAnnotationResult {
    annotatedData: Record<string, SourceAnnotatedData>;
    statistics: {
        totalFields: number;
        annotatedFields: number;
        verifiedFields: number;
        llmGeneratedFields: number;
        pendingFields: number;
    };
    annotatedAt: Date;
}
