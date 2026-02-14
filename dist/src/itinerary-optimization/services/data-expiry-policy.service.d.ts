export interface TimestampedData<T = any> {
    data: T;
    metadata: {
        timestamp: string;
        source: 'API' | 'CACHE' | 'DATABASE' | 'ESTIMATED' | 'DEFAULT';
        expiry_policy: ExpiryPolicy;
        reliability: 'HIGH' | 'MEDIUM' | 'LOW';
    };
}
export interface ExpiryPolicy {
    type: 'TTL' | 'SCHEDULED' | 'EVENT_BASED';
    ttl_seconds?: number;
    expiry_time?: string;
    event_trigger?: string;
}
export interface DataQualityAssessment {
    is_expired: boolean;
    age_seconds: number;
    reliability: 'HIGH' | 'MEDIUM' | 'LOW';
    warnings: string[];
    recommendations: string[];
}
export declare class DataExpiryPolicyService {
    private readonly logger;
    private readonly defaultTTL;
    isExpired(data: TimestampedData): boolean;
    private isExpiredByDefaultTTL;
    private inferDataType;
    getDataAge(data: TimestampedData): number;
    assessDataQuality(data: TimestampedData): DataQualityAssessment;
    assessMultipleDataQuality(dataList: TimestampedData[]): {
        overall: {
            total: number;
            expired: number;
            low_reliability: number;
            warnings_count: number;
        };
        details: Array<{
            index: number;
            assessment: DataQualityAssessment;
        }>;
    };
    createTimestampedData<T>(data: T, options?: {
        source?: TimestampedData['metadata']['source'];
        expiry_policy?: ExpiryPolicy;
        reliability?: 'HIGH' | 'MEDIUM' | 'LOW';
    }): TimestampedData<T>;
    private inferReliability;
    private formatAge;
    getDefaultTTL(dataType: string): number;
    setDefaultTTL(dataType: string, ttlSeconds: number): void;
}
