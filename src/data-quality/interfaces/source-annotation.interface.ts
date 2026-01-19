 // src/data-quality/interfaces/source-annotation.interface.ts

/**
 * 信息源标注接口定义
 * 
 * 扩展数据源信息，添加来源标注和置信度
 */

/**
 * 信息可信度等级
 */
export type VerificationLevel =
  | 'A_VERIFIED'      // A级：已验证（至少2个独立可靠来源）
  | 'B_RELIABLE'      // B级：可靠（官方或权威渠道）
  | 'C_USER_FEEDBACK' // C级：用户反馈
  | 'D_PENDING'       // D级：待验证
  | 'E_LLM_GENERATED'; // E级：LLM生成内容

/**
 * 数据源类型（扩展）
 */
export type DataSourceType =
  | 'DEM'
  | 'TRANSPORT'
  | 'POI'
  | 'WEATHER'
  | 'ROUTE'
  | 'OPENING_HOURS'
  | 'USER_INPUT'
  | 'LLM_GENERATED'
  | 'ESTIMATED'
  | 'DEFAULT'
  | 'OTHER';

/**
 * 数据来源（扩展）
 */
export type DataSource =
  | 'API'
  | 'CACHE'
  | 'DATABASE'
  | 'ESTIMATED'
  | 'DEFAULT'
  | 'USER_INPUT'
  | 'LLM_GENERATED'
  | 'EXTERNAL_API'
  | 'SENSOR'
  | 'THIRD_PARTY';

/**
 * 扩展的数据源信息
 */
export interface ExtendedDataSourceInfo {
  /** 数据源类型 */
  type: DataSourceType;
  /** 时间戳（ISO 8601） */
  timestamp: string;
  /** 过期时间（可选） */
  expiry?: string;
  /** 可靠性等级 */
  reliability: 'HIGH' | 'MEDIUM' | 'LOW';
  /** 数据来源 */
  source: DataSource;
  /** 数据来源URL（可选） */
  sourceUrl?: string;
  /** 数据来源名称（如"中央气象台"） */
  sourceName: string;
  /** 置信度（0-1） */
  confidence: number;
  /** 验证等级 */
  verificationLevel: VerificationLevel;
  /** 交叉验证次数（可选） */
  crossValidationCount?: number;
  /** 最后验证时间（可选） */
  lastVerifiedAt?: string;
  /** 是否为事实性信息（true）还是LLM生成内容（false） */
  isFactual: boolean;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 带来源标注的数据
 */
export interface SourceAnnotatedData {
  /** 数据值 */
  value: any;
  /** 字段名 */
  fieldName: string;
  /** 数据来源信息 */
  source: ExtendedDataSourceInfo;
  /** 数据质量标注（可选） */
  quality?: {
    completeness?: number;
    accuracy?: number;
    consistency?: number;
    timeliness?: number;
    traceability?: number;
  };
}

/**
 * 批量标注结果
 */
export interface BatchAnnotationResult {
  /** 标注的数据 */
  annotatedData: Record<string, SourceAnnotatedData>;
  /** 标注统计 */
  statistics: {
    totalFields: number;
    annotatedFields: number;
    verifiedFields: number;
    llmGeneratedFields: number;
    pendingFields: number;
  };
  /** 标注时间戳 */
  annotatedAt: Date;
}
