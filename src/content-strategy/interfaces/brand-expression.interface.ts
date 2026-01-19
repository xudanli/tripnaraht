// src/content-strategy/interfaces/brand-expression.interface.ts

/**
 * 品牌表达框架接口定义
 * 
 * 基于 IMPLEMENTATION_PLAN_P0.md 的要求：
 * - 理性表达的四个层级（事实、关系、预测、建议）
 * - 温度表达的四个维度（理解、陪伴、鼓励、细节）
 * - 理性和温度的平衡法则
 */

import { UserContext } from './copy-standards.interface';

/**
 * 表达上下文
 */
export interface ExpressionContext {
  /** 场景类型 */
  scenario?: CommunicationScenario;
  /** 用户上下文 */
  userContext?: UserContext;
  /** 数据上下文 */
  dataContext?: Record<string, any>;
}

/**
 * 沟通场景
 */
export type CommunicationScenario =
  | 'risk_warning'
  | 'decision_support'
  | 'encouragement'
  | 'story_sharing'
  | 'error_handling'
  | 'information_sharing'
  | 'rejection'
  | 'confirmation';

/**
 * 理性表达的四个层级
 */
export interface RationalExpression {
  /** 事实层：客观数据、事实陈述 */
  factLayer: {
    facts: string[];
    data: Record<string, any>;
  };
  /** 关系层：事实之间的关联、因果关系 */
  relationLayer: {
    relations: string[];
    connections: Array<{
      from: string;
      to: string;
      relation: string;
    }>;
  };
  /** 预测层：基于数据的预测、可能性分析 */
  predictionLayer: {
    predictions: Array<{
      scenario: string;
      probability: number;
      explanation: string;
    }>;
  };
  /** 建议层：基于理性的建议、行动指南 */
  suggestionLayer: {
    suggestions: string[];
    rationale: string[];
  };
}

/**
 * 温度表达的四个维度
 */
export interface WarmthExpression {
  /** 理解：理解用户的处境、感受 */
  understanding: {
    message: string;
    empathy: string[];
  };
  /** 陪伴：陪伴用户、共同面对 */
  companion: {
    message: string;
    support: string[];
  };
  /** 鼓励：给予鼓励、正面反馈 */
  encouragement: {
    message: string;
    positive: string[];
  };
  /** 细节：关注细节、个性化表达 */
  detail: {
    personalized: string[];
    attention: string[];
  };
}

/**
 * 沟通上下文
 */
export interface CommunicationContext {
  /** 场景 */
  scenario: CommunicationScenario;
  /** 用户上下文 */
  userContext?: UserContext;
  /** 内容 */
  content?: any;
}

/**
 * 平衡的文案（理性+温度）
 */
export interface BalancedCopy {
  /** 理性部分 */
  rational: {
    text: string;
    layers: RationalExpression;
  };
  /** 温度部分 */
  warmth: {
    text: string;
    dimensions: WarmthExpression;
  };
  /** 组合后的完整文案 */
  combined: string;
  /** 比例 */
  ratio: {
    rational: number;
    warmth: number;
  };
}
