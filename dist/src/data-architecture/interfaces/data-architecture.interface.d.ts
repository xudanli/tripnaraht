export type DataArchitectureLayer = 'USER_INTERACTION' | 'DECISION_SUPPORT' | 'PROCESSING_FUSION' | 'STORAGE_COLLECTION';
export interface RawData {
    sourceId: string;
    sourceName: string;
    data: any;
    timestamp: string;
    metadata: {
        sourceType: 'API' | 'DATABASE' | 'FILE' | 'STREAM' | 'USER_INPUT';
        reliability: number;
        freshness: number;
        format: string;
    };
}
export interface ProcessedData {
    data: any;
    features: Record<string, any>;
    quality: {
        completeness: number;
        accuracy: number;
        consistency: number;
        timeliness: number;
        traceability: number;
        overallScore: number;
    };
    metadata: {
        processedAt: string;
        processingSteps: Array<{
            step: string;
            method: string;
            parameters?: Record<string, any>;
        }>;
        sourceData: RawData[];
        fusionStrategy?: string;
    };
}
export interface DecisionData {
    context: Record<string, any>;
    options: Array<{
        id: string;
        label: string;
        data: any;
        quality: number;
    }>;
    recommendations: Array<{
        type: 'RECOMMENDATION' | 'WARNING' | 'REJECTION';
        content: string;
        confidence: number;
        evidence: string[];
    }>;
    metadata: {
        preparedAt: string;
        decisionContext: Record<string, any>;
        dataSources: string[];
    };
}
export interface UIData {
    displayData: any;
    explanations: Array<{
        level: 'CONCLUSION' | 'REASON' | 'EVIDENCE';
        content: string;
        confidence?: number;
    }>;
    interactions: Array<{
        type: 'CONFIRMATION' | 'SELECTION' | 'INPUT' | 'FEEDBACK';
        label: string;
        options?: string[];
    }>;
    metadata: {
        preparedAt: string;
        userContext: Record<string, any>;
        dataQuality: {
            overallScore: number;
            qualityLevel: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
        };
    };
}
export interface DataFlowConfig {
    enableQualityCheck?: boolean;
    enableFusion?: boolean;
    enableFeatureEngineering?: boolean;
    qualityThreshold?: number;
    fusionStrategy?: string;
    layerConfigs?: Record<DataArchitectureLayer, Record<string, any>>;
}
export interface DataFlowResult {
    rawData: RawData[];
    processedData?: ProcessedData;
    decisionData?: DecisionData;
    uiData?: UIData;
    flowMetrics: {
        totalTime: number;
        layerTimes: Record<DataArchitectureLayer, number>;
        qualityScores: Record<DataArchitectureLayer, number>;
    };
    errors?: Array<{
        layer: DataArchitectureLayer;
        error: string;
        timestamp: string;
    }>;
}
