// src/data-pipeline/interfaces/data-pipeline.interface.ts

/**
 * 数据管道框架接口定义
 * 
 * 基于 DATA_MODELING_COMPLIANCE.md 的要求：
 * - 数据采集管道（data_collection_pipeline）
 * - 数据处理管道（data_processing_pipeline）
 * - 数据应用管道（data_application_pipeline）
 */

/**
 * 数据源类型
 */
export type DataSourceType =
  | 'user_input'
  | 'internal_db'
  | 'weather_api'
  | 'crowd_sensor'
  | 'poi_api'
  | 'transport_api'
  | 'dem_api'
  | 'external';

/**
 * 采集频率
 */
export type CollectionFrequency =
  | 'on_change'
  | '30_minutes'
  | '1_hour'
  | '3_hours'
  | 'daily'
  | 'weekly';

/**
 * 采集任务配置
 */
export interface CollectionTaskConfig {
  /** 数据源类型 */
  source: DataSourceType;
  /** 采集频率 */
  frequency: CollectionFrequency;
  /** 数据源标识 */
  sourceId?: string;
  /** 额外配置 */
  config?: Record<string, any>;
}

/**
 * 采集的数据
 */
export interface CollectedData {
  /** 数据标识 */
  [taskName: string]: {
    /** 原始数据 */
    rawData: any;
    /** 采集时间 */
    collectedAt: Date;
    /** 数据源 */
    source: DataSourceType;
    /** 元数据 */
    metadata?: Record<string, any>;
  };
}

/**
 * 清洗后的数据
 */
export interface CleanedData {
  /** 处理缺失值 */
  missingValuesHandled: any;
  /** 处理异常值 */
  outliersHandled: any;
  /** 格式标准化 */
  formatStandardized: any;
  /** 清洗报告 */
  cleaningReport: {
    missingValuesCount: number;
    outliersCount: number;
    formatIssuesCount: number;
  };
}

/**
 * 标准化后的数据
 */
export interface StandardizedData {
  /** 统一时间格式 */
  timeFormat: any;
  /** 统一地理坐标系 */
  coordinateSystem: any;
  /** 统一单位 */
  units: any;
  /** 标准化报告 */
  standardizationReport: {
    timeFormatIssues: number;
    coordinateSystemIssues: number;
    unitIssues: number;
  };
}

/**
 * 处理后的数据
 */
export interface ProcessedData {
  /** 清洗后的数据 */
  cleaned: CleanedData;
  /** 标准化后的数据 */
  standardized: StandardizedData;
  /** 融合后的数据 */
  fused?: any;
  /** 特征工程后的数据 */
  engineered?: any;
  /** 处理时间戳 */
  processedAt: Date;
  /** 处理元数据 */
  metadata: Record<string, any>;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误列表 */
  errors: Array<{
    field: string;
    message: string;
    code: string;
  }>;
  /** 警告列表 */
  warnings: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * 数据质量异常
 */
export class DataQualityException extends Error {
  constructor(
    message: string,
    public readonly qualityAssessment: any,
  ) {
    super(message);
    this.name = 'DataQualityException';
  }
}
