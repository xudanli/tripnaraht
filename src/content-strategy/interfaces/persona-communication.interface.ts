// src/content-strategy/interfaces/persona-communication.interface.ts

/**
 * 用户人群定制化沟通接口定义
 * 
 * 基于 CONTENT_STRATEGY_COMPLIANCE.md 的要求：
 * - 三个核心用户人格：理性探险者、体验追求者、保守安全者
 * - 不同文化背景的适配
 * - 不同城市用户的沟通适配
 */

import { UserContext } from './copy-standards.interface';
import { CommunicationContext } from './brand-expression.interface';

/**
 * 用户人格类型
 */
export type UserPersona = 'RATIONAL_EXPLORER' | 'EXPERIENCE_SEEKER' | 'CONSERVATIVE_SAFETY';

/**
 * 文化背景
 */
export interface Culture {
  /** 语言 */
  language: 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR';
  /** 地区 */
  region?: string;
  /** 城市 */
  city?: string;
}

/**
 * 用户画像
 */
export interface UserProfile {
  /** 用户ID */
  userId?: string;
  /** 偏好 */
  preferences?: {
    pace?: string;
    riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
    interests?: string[];
    fitness?: string;
  };
  /** 历史行为 */
  history?: {
    pastTrips?: any[];
    decisions?: any[];
  };
  /** 文化背景 */
  culture?: Culture;
}

/**
 * 人格特征
 */
export interface PersonaCharacteristics {
  /** 人格类型 */
  type: UserPersona;
  /** 置信度（0-1） */
  confidence: number;
  /** 特征描述 */
  traits: string[];
  /** 沟通偏好 */
  communicationPreferences: {
    tone: 'FORMAL' | 'CASUAL' | 'FRIENDLY' | 'PROFESSIONAL';
    detailLevel: 'MINIMAL' | 'MODERATE' | 'DETAILED';
    focus: string[];
  };
}

/**
 * 人格化沟通策略
 */
export interface PersonaCommunication {
  /** 沟通风格 */
  style: {
    tone: string;
    language: string[];
    emphasis: string[];
  };
  /** 内容重点 */
  contentFocus: {
    primary: string[];
    secondary: string[];
    avoid: string[];
  };
  /** 沟通方式 */
  approach: {
    introduction: string;
    explanation: string;
    callToAction: string;
  };
}

/**
 * 文化适配
 */
export interface CulturalAdaptation {
  /** 适配后的文本 */
  adaptedText: string;
  /** 文化特定元素 */
  culturalElements: {
    expressions: string[];
    references: string[];
    style: string;
  };
}
