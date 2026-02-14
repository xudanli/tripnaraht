export type DataSourceType = 'user_input' | 'internal_db' | 'weather_api' | 'crowd_sensor' | 'poi_api' | 'transport_api' | 'dem_api' | 'external';
export type CollectionFrequency = 'on_change' | '30_minutes' | '1_hour' | '3_hours' | 'daily' | 'weekly';
export interface CollectionTaskConfig {
    source: DataSourceType;
    frequency: CollectionFrequency;
    sourceId?: string;
    config?: Record<string, any>;
}
export interface CollectedData {
    [taskName: string]: {
        rawData: any;
        collectedAt: Date;
        source: DataSourceType;
        metadata?: Record<string, any>;
    };
}
export interface CleanedData {
    missingValuesHandled: any;
    outliersHandled: any;
    formatStandardized: any;
    cleaningReport: {
        missingValuesCount: number;
        outliersCount: number;
        formatIssuesCount: number;
    };
}
export interface StandardizedData {
    timeFormat: any;
    coordinateSystem: any;
    units: any;
    standardizationReport: {
        timeFormatIssues: number;
        coordinateSystemIssues: number;
        unitIssues: number;
    };
}
export interface ProcessedData {
    cleaned: CleanedData;
    standardized: StandardizedData;
    fused?: any;
    engineered?: any;
    processedAt: Date;
    metadata: Record<string, any>;
}
export interface ValidationResult {
    valid: boolean;
    errors: Array<{
        field: string;
        message: string;
        code: string;
    }>;
    warnings: Array<{
        field: string;
        message: string;
    }>;
}
export declare class DataQualityException extends Error {
    readonly qualityAssessment: any;
    constructor(message: string, qualityAssessment: any);
}
