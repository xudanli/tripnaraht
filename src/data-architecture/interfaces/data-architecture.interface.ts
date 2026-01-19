// src/data-architecture/interfaces/data-architecture.interface.ts

/**
 * 数据架构层级
 */
export type DataArchitectureLayer = 
  | 'USER_INTERACTION'      // 用户交互层
  | 'DECISION_SUPPORT'       // 决策支持层
  | 'PROCESSING_FUSION'      // 处理与融合层
  | 'STORAGE_COLLECTION';    // 存储与采集层

/**
 * 原始数据（存储与采集层）
 */
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

/**
 * 处理后的数据（处理与融合层）
 */
export interface ProcessedData {
  data: any;
  features: Record<string, any>;  // 特征工程结果
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

/**
 * 决策支持数据（决策支持层）
 */
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

/**
 * 用户界面数据（用户交互层）
 */
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

/**
 * 数据流转配置
 */
export interface DataFlowConfig {
  enableQualityCheck?: boolean;
  enableFusion?: boolean;
  enableFeatureEngineering?: boolean;
  qualityThreshold?: number;
  fusionStrategy?: string;
  layerConfigs?: Record<DataArchitectureLayer, Record<string, any>>;
}

/**
 * 数据流转结果
 */
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
