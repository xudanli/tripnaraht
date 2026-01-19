// src/data-privacy/interfaces/data-privacy.interface.ts

/**
 * 数据隐私保护框架接口定义
 * 
 * 基于 DATA_MODELING_COMPLIANCE.md 的要求：
 * - 最小必要原则
 * - 用户知情和同意
 * - 数据加密
 * - 数据最小化保留期
 * - 用户的数据权利
 */

/**
 * 数据用途
 */
export type DataPurpose =
  | 'HEALTH_RISK_ASSESSMENT'
  | 'LOCATION_TRACKING'
  | 'BEHAVIORAL_ANALYSIS'
  | 'TRIP_PLANNING'
  | 'PERSONALIZATION'
  | 'ANALYTICS';

/**
 * 数据使用说明
 */
export interface DataUsage {
  /** 用途 */
  purpose: DataPurpose;
  /** 使用的数据字段 */
  fields: string[];
  /** 使用期限 */
  retentionDays: number;
  /** 是否共享给第三方 */
  sharedWithThirdParty: boolean;
  /** 第三方名称 */
  thirdPartyName?: string;
}

/**
 * 用户同意
 */
export interface Consent {
  /** 是否需要同意 */
  required: boolean;
  /** 同意ID（如果已同意） */
  consentId?: string;
  /** 同意时间（如果已同意） */
  grantedAt?: Date;
  /** 同意文本 */
  consentText?: string;
  /** 需要同意的字段 */
  consentFields?: string[];
}

/**
 * 加密数据
 */
export interface EncryptedData {
  /** 加密后的数据 */
  encrypted: string;
  /** 加密密钥ID */
  encryptionKeyId: string;
  /** 加密时间 */
  encryptedAt: Date;
  /** 加密算法 */
  algorithm: string;
}

/**
 * 数据类型
 */
export type DataType =
  | 'HEALTH_DATA'
  | 'LOCATION_DATA'
  | 'BEHAVIORAL_DATA'
  | 'PERSONAL_DATA'
  | 'PAYMENT_DATA'
  | 'OTHER';

/**
 * 保留策略
 */
export interface RetentionPolicy {
  /** 数据类型 */
  dataType: DataType;
  /** 保留天数 */
  retentionDays: number;
  /** 是否自动删除 */
  autoDelete: boolean;
  /** 创建时间 */
  createdAt: Date;
}

/**
 * 用户数据权利
 */
export interface DataRights {
  /** 访问：获取个人数据 */
  access: () => Promise<UserDataExport>;
  /** 修正：更正错误数据 */
  correct: (field: string, value: any) => Promise<void>;
  /** 删除：删除个人数据 */
  delete: () => Promise<void>;
  /** 导出：导出个人数据 */
  export: () => Promise<UserDataExport>;
}

/**
 * 用户数据导出
 */
export interface UserDataExport {
  /** 用户ID */
  userId: string;
  /** 导出时间 */
  exportedAt: Date;
  /** 数据 */
  data: Record<string, any>;
  /** 格式 */
  format: 'json' | 'csv';
}

/**
 * 健康数据
 */
export interface HealthData {
  /** 用户ID */
  userId: string;
  /** 健康信息 */
  healthInfo: {
    age?: number;
    fitnessLevel?: string;
    medicalConditions?: string[];
    allergies?: string[];
    medications?: string[];
  };
}

/**
 * 处理后的健康数据
 */
export interface ProcessedHealthData {
  /** 数据 */
  data: EncryptedData;
  /** 加密说明 */
  encryption: string;
  /** 访问控制 */
  accessControl: string;
  /** 保留期限 */
  retention: string;
  /** 用途限制 */
  purposeLimitation: string;
}

/**
 * 位置数据
 */
export interface LocationData {
  /** 数据ID */
  id: string;
  /** 用户ID */
  userId: string;
  /** 位置信息 */
  location: {
    latitude: number;
    longitude: number;
    timestamp: Date;
    accuracy?: number;
  };
}

/**
 * 处理后的位置数据
 */
export interface ProcessedLocationData {
  /** 数据 */
  data: any;
  /** 加密说明 */
  encryption: string;
  /** 实时处理说明 */
  realTimeHandling: string;
  /** 历史保留期限 */
  historicalRetention: string;
}

/**
 * 行为数据
 */
export interface BehavioralData {
  /** 用户ID */
  userId: string;
  /** 行为信息 */
  behavior: {
    searchHistory?: any[];
    clickHistory?: any[];
    preferences?: Record<string, any>;
  };
}

/**
 * 处理后的行为数据
 */
export interface ProcessedBehavioralData {
  /** 数据 */
  data: any;
  /** 匿名化说明 */
  anonymization: string;
  /** 聚合说明 */
  aggregation: string;
  /** 保留期限 */
  retention: string;
}

/**
 * 最小必要数据
 */
export interface MinimalData {
  /** 必需字段 */
  requiredFields: string[];
  /** 数据 */
  data: Record<string, any>;
  /** 排除的字段 */
  excludedFields: string[];
}
