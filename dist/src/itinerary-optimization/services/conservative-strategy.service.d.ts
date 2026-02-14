import { PlanRequest } from '../interfaces/plan-request.interface';
import { DataExpiryPolicyService, TimestampedData } from './data-expiry-policy.service';
export type MissingDataType = 'DEM' | 'TRANSPORT' | 'OPENING_HOURS' | 'WEATHER' | 'POI' | 'ROUTE';
export interface MissingDataInfo {
    type: MissingDataType;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
    affected_segments: string[];
    description: string;
    impact: string;
}
export interface ConservativeResult {
    decision: 'REJECT' | 'ADJUST' | 'PROCEED_WITH_WARNING';
    reason?: string;
    strategy?: 'SAFE_ROUTE_ONLY' | 'REDUCED_CONSTRAINTS' | 'ESTIMATED_VALUES';
    constraints?: {
        require_verified_route?: boolean;
        avoid_segments?: string[];
        safety_buffer_multiplier?: number;
        max_risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
    };
    missing_data?: MissingDataInfo[];
    suggestions?: string[];
    explanation?: string;
    warnings?: Array<{
        type: string;
        message: string;
        reliability: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
}
export interface DataQualityCheckResult {
    has_stale_data: boolean;
    has_missing_data: boolean;
    missing_data_list: MissingDataInfo[];
    stale_data_list: Array<{
        type: string;
        age_seconds: number;
        reliability: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
}
export declare class ConservativeStrategyService {
    private dataExpiryPolicyService;
    private readonly logger;
    constructor(dataExpiryPolicyService: DataExpiryPolicyService);
    checkDataQuality(request: PlanRequest, dataSources: {
        dem?: TimestampedData<any>;
        transport?: TimestampedData<any>;
        opening_hours?: TimestampedData<Record<string, any>>;
        weather?: TimestampedData<any>;
        poi?: TimestampedData<Record<string, any>>;
    }): Promise<DataQualityCheckResult>;
    applyConservativeStrategy(request: PlanRequest, dataQuality: DataQualityCheckResult): Promise<ConservativeResult>;
    private assessDEMSeverity;
    private getAffectedSegments;
    private generateDataRecoverySuggestions;
    private generateRejectionExplanation;
    private generateAdjustmentExplanation;
    private formatAge;
}
