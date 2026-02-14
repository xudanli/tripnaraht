import { DataSourceInfo } from '../../data-quality/interfaces/data-quality-dimensions.interface';
export type DataConflictType = 'VALUE_MISMATCH' | 'TYPE_MISMATCH' | 'RANGE_MISMATCH' | 'TEMPORAL_MISMATCH' | 'SPATIAL_MISMATCH' | 'LOGICAL_CONTRADICTION';
export type ConflictSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export interface DataConflict {
    field: string;
    type: DataConflictType;
    severity: ConflictSeverity;
    sources: Array<{
        sourceId: string;
        sourceName: string;
        value: any;
        reliability: number;
        timestamp?: string;
    }>;
    description: string;
    impact: string[];
    resolutionStrategy?: 'RELIABILITY_WEIGHTED' | 'PRIORITY_SELECTION' | 'CONTEXT_BASED' | 'AVERAGE' | 'MANUAL';
}
export interface ConflictReport {
    conflicts: DataConflict[];
    totalConflicts: number;
    criticalConflicts: number;
    highConflicts: number;
    mediumConflicts: number;
    lowConflicts: number;
    affectedFields: string[];
    summary: string;
}
export type FusionStrategy = 'RELIABILITY_WEIGHTED' | 'PRIORITY_SELECTION' | 'CONTEXT_BASED' | 'AVERAGE' | 'MEDIAN' | 'MODE' | 'CONSENSUS';
export interface FusedData {
    value: any;
    confidence: number;
    strategy: FusionStrategy;
    sources: string[];
    metadata: {
        fusionTimestamp: string;
        conflictCount: number;
        resolutionDetails: Array<{
            field: string;
            strategy: FusionStrategy;
            selectedValue: any;
            rejectedValues: Array<{
                sourceId: string;
                value: any;
                reason: string;
            }>;
        }>;
    };
}
export interface DataSourceConfig {
    sourceId: string;
    sourceName: string;
    data: any;
    reliability: number;
    priority: number;
    timestamp?: string;
    sourceInfo?: DataSourceInfo;
    context?: Record<string, any>;
}
export interface FusionConfig {
    defaultStrategy?: FusionStrategy;
    reliabilityThreshold?: number;
    conflictResolutionStrategy?: 'AUTO' | 'MANUAL' | 'HYBRID';
    enableConflictDetection?: boolean;
    context?: Record<string, any>;
}
export interface FusionResult {
    fusedData: FusedData;
    conflictReport?: ConflictReport;
    qualityMetrics: {
        completeness: number;
        accuracy: number;
        consistency: number;
        overallQuality: number;
    };
    recommendations: string[];
}
