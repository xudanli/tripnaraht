// src/agent/interfaces/hallucination-detection.interface.ts

/**
 * 防幻觉检测接口定义
 * 
 * 基于 AI_REASONING_SYSTEM_COMPLIANCE.md 的要求：
 * - Step 8：幻觉检测
 * - 8.1：识别所有事实声明
 * - 8.2：来源验证
 * - 8.3：置信度标注
 * - 8.4：幻觉标记
 * - 8.5：用户通知
 */

import { ExtendedDataSourceInfo } from '../../data-quality/interfaces/source-annotation.interface';

/**
 * 事实声明类型
 */
export type ClaimType = 'FACT' | 'SPECULATION' | 'RECOMMENDATION' | 'OPINION';

/**
 * 置信度等级
 */
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

/**
 * 事实声明
 */
export interface FactualClaim {
  /** 声明文本 */
  text: string;
  /** 声明类型 */
  type: ClaimType;
  /** 在输出中的位置 */
  position?: {
    start: number;
    end: number;
  };
  /** 实体（如果有） */
  entities?: string[];
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 已验证的声明
 */
export interface VerifiedClaim extends FactualClaim {
  /** 是否已验证 */
  verified: boolean;
  /** 数据来源 */
  source: ExtendedDataSourceInfo | null;
  /** 置信度（0-1） */
  confidence: number;
  /** 验证时间 */
  verifiedAt?: Date;
}

/**
 * 带置信度标注的声明
 */
export interface AnnotatedClaim extends VerifiedClaim {
  /** 置信度等级 */
  confidenceLevel: ConfidenceLevel;
}

/**
 * 幻觉标记的声明
 */
export interface HallucinationMarkedClaim extends AnnotatedClaim {
  /** 是否为幻觉风险 */
  isHallucinationRisk: boolean;
  /** 处理动作 */
  action: 'REMOVE' | 'KEEP' | 'FLAG';
}

/**
 * 用户通知
 */
export interface UserNotification {
  /** 是否有风险 */
  hasRisks: boolean;
  /** 通知消息 */
  message: string | null;
  /** 低置信度项目 */
  lowConfidenceItems?: Array<{
    text: string;
    confidence: number;
    source?: string;
  }>;
}

/**
 * 防幻觉检测结果
 */
export interface HallucinationDetectionResult {
  /** 已验证的声明 */
  verifiedClaims: VerifiedClaim[];
  /** 幻觉风险列表 */
  hallucinationRisks: HallucinationMarkedClaim[];
  /** 用户通知 */
  userNotification: UserNotification;
  /** 清理后的输出 */
  cleanedOutput: any;
  /** 检测统计 */
  statistics: {
    totalClaims: number;
    verifiedClaims: number;
    hallucinationRisks: number;
    removedClaims: number;
  };
}
