// src/data-quality/interfaces/data-quality-dimensions.interface.ts

/**
 * 数据质量五维度框架接口定义
 * 
 * 基于 DATA_MODELING_COMPLIANCE.md 的要求：
 * - 完整性（Completeness）：所需的数据是否都被采集到
 * - 准确性（Accuracy）：数据是否反映真实情况
 * - 一致性（Consistency）：不同数据源是否协调一致
 * - 时效性（Timeliness）：数据是否及时更新
 * - 可追溯性（Traceability）：数据来源是否清晰可追踪
 */

/**
 * 完整性指标
 */
export interface CompletenessMetric {
  /** 定义：所需的数据是否都被采集到 */
  definition: string;
  /** 计算公式：有效记录数 / 总记录数 × 100% */
  calculation: string;
  /** 目标值：> 95% */
  target: string;
  /** 测量频率：每日 */
  measurementFrequency: string;
  /** 当前值：0-1 */
  currentValue: number;
  /** 缺失字段列表 */
  missingFields: string[];
  /** 完整字段列表 */
  completeFields: string[];
  /** 总字段数 */
  totalFields: number;
  /** 有效记录数 */
  validRecords: number;
  /** 总记录数 */
  totalRecords: number;
}

/**
 * 准确性指标
 */
export interface AccuracyMetric {
  /** 定义：数据是否反映真实情况 */
  definition: string;
  /** 计算公式：正确数据 / 总数据 × 100% */
  calculation: string;
  /** 目标值：> 90% */
  target: string;
  /** 测量频率：每周 */
  measurementFrequency: string;
  /** 当前值：0-1 */
  currentValue: number;
  /** 正确数据数 */
  correctData: number;
  /** 总数据数 */
  totalData: number;
  /** 错误数据列表 */
  errors: Array<{
    field: string;
    expected?: any;
    actual: any;
    errorType: 'format' | 'range' | 'logic' | 'reference';
  }>;
}

/**
 * 一致性指标
 */
export interface ConsistencyMetric {
  /** 定义：不同数据源是否协调一致 */
  definition: string;
  /** 计算公式：一致的数据 / 总数据 × 100% */
  calculation: string;
  /** 目标值：> 95% */
  target: string;
  /** 测量频率：每日 */
  measurementFrequency: string;
  /** 当前值：0-1 */
  currentValue: number;
  /** 一致的数据数 */
  consistentData: number;
  /** 总数据数 */
  totalData: number;
  /** 不一致的数据列表 */
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

/**
 * 时效性指标
 */
export interface TimelinessMetric {
  /** 定义：数据是否及时更新 */
  definition: string;
  /** 计算公式：及时数据 / 总数据 × 100% */
  calculation: string;
  /** 目标值：根据业务需求定义 */
  target: string;
  /** 测量频率：实时 */
  measurementFrequency: string;
  /** 当前值：0-1 */
  currentValue: number;
  /** 及时数据数 */
  timelyData: number;
  /** 总数据数 */
  totalData: number;
  /** 过期数据列表 */
  staleData: Array<{
    field: string;
    lastUpdated: string;
    ageSeconds: number;
    maxAgeSeconds: number;
    source: string;
  }>;
}

/**
 * 可追溯性指标
 */
export interface TraceabilityMetric {
  /** 定义：数据来源是否清晰可追踪 */
  definition: string;
  /** 计算公式：有完整来源记录的数据 / 总数据 × 100% */
  calculation: string;
  /** 目标值：100% */
  target: string;
  /** 测量频率：每周 */
  measurementFrequency: string;
  /** 当前值：0-1 */
  currentValue: number;
  /** 有完整来源记录的数据数 */
  traceableData: number;
  /** 总数据数 */
  totalData: number;
  /** 不可追溯的数据列表 */
  untraceableData: Array<{
    field: string;
    missingInfo: string[];
  }>;
}

/**
 * 数据质量综合评估结果
 */
export interface DataQualityAssessment {
  /** 评估时间戳 */
  timestamp: string;
  /** 数据ID或标识 */
  dataId?: string;
  /** 数据类型 */
  dataType?: string;
  /** 完整性指标 */
  completeness: CompletenessMetric;
  /** 准确性指标 */
  accuracy: AccuracyMetric;
  /** 一致性指标 */
  consistency: ConsistencyMetric;
  /** 时效性指标 */
  timeliness: TimelinessMetric;
  /** 可追溯性指标 */
  traceability: TraceabilityMetric;
  /** 综合质量分数（0-1，五维度加权平均） */
  overallScore: number;
  /** 质量等级 */
  qualityLevel: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
  /** 改进建议 */
  recommendations: string[];
}

/**
 * 数据源信息（用于可追溯性）
 */
export interface DataSourceInfo {
  /** 数据源ID */
  sourceId: string;
  /** 数据源名称 */
  sourceName: string;
  /** 数据源类型 */
  sourceType: 'api' | 'database' | 'user_input' | 'inferred' | 'external' | 'cache';
  /** 数据获取时间 */
  timestamp: string;
  /** 数据版本 */
  version?: string;
  /** 数据提供者 */
  provider?: string;
  /** 置信度（0-1） */
  confidence?: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 带来源标注的数据
 */
export interface AnnotatedData {
  /** 数据值 */
  value: any;
  /** 数据来源信息 */
  source: DataSourceInfo;
  /** 数据质量标注 */
  quality?: {
    completeness?: number;
    accuracy?: number;
    consistency?: number;
    timeliness?: number;
    traceability?: number;
  };
}
