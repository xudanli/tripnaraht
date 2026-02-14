import { ExtendedDataSourceInfo } from './source-annotation.interface';
export interface DataSourceNode {
    sourceId: string;
    type: string;
    data: any;
    reliability: number;
    freshness: {
        timestamp: string;
        age: string;
        isStale: boolean;
    };
    sourceInfo: ExtendedDataSourceInfo;
    metadata?: Record<string, any>;
}
export interface ProcessingStep {
    step: number;
    operation: string;
    input: string[];
    output: any;
    method: string;
    parameters?: Record<string, any>;
    timestamp: string;
    duration?: number;
    dependencies?: number[];
}
export interface LineageTree {
    dataSources: Record<string, DataSourceNode>;
    processingSteps: ProcessingStep[];
    finalOutput: any;
    confidence: number;
    assumptions: string[];
    limitations: string[];
    metadata?: {
        createdAt: string;
        updatedAt: string;
        version: string;
    };
}
export interface UserFriendlyExplanation {
    summary: string;
    detailedExplanation: string;
    sourceExplanation: string;
    processExplanation: string;
    confidenceExplanation: string;
    visualization?: {
        type: 'TREE' | 'FLOW' | 'TIMELINE';
        data: any;
    };
}
export interface LineageQueryOptions {
    includeData?: boolean;
    includeSteps?: boolean;
    generateExplanation?: boolean;
    maxDepth?: number;
}
