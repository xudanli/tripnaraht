// src/content-strategy/interfaces/copy-examples.interface.ts

/**
 * 系统话术示例库接口定义
 * 
 * 基于 CONTENT_STRATEGY_COMPLIANCE.md 的要求：
 * - 关键场景的完整话术
 * - 错误与异常的话术
 */

/**
 * 场景类型
 */
export type ScenarioType =
  | 'FIRST_TIME_USER'
  | 'ROUTE_COMPARISON'
  | 'LONELINESS_CONCERN'
  | 'WEATHER_RISK'
  | 'PHYSICAL_RISK'
  | 'BUDGET_CONCERN'
  | 'TIME_CONSTRAINT'
  | 'DECISION_HESITATION'
  | 'SUCCESS_CONFIRMATION'
  | 'REJECTION_RESPONSE';

/**
 * 错误类型
 */
export type ErrorType =
  | 'SYSTEM_ERROR'
  | 'NETWORK_ERROR'
  | 'DATA_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'PERMISSION_DENIED'
  | 'TIMEOUT_ERROR'
  | 'RATE_LIMIT'
  | 'MAINTENANCE';

/**
 * 首次用户话术
 */
export interface FirstTimeUserCopy {
  /** 首屏文案 */
  firstScreenCopy: string;
  /** 第一个问题 */
  firstQuestion: string;
  /** 引导文案 */
  guidance: string[];
}

/**
 * 路线对比话术
 */
export interface RouteComparisonCopy {
  /** 对比说明 */
  comparison: {
    routes: Array<{
      name: string;
      strengths: string[];
      considerations: string[];
    }>;
    summary: string;
  };
  /** 建议 */
  suggestion: {
    message: string;
    reflection: string[];
  };
}

/**
 * 孤独担忧话术
 */
export interface LonelinessConcernCopy {
  /** 共情 */
  empathy: string;
  /** 澄清 */
  clarification: string;
  /** 社交机会 */
  socialOpportunities: string[];
}

/**
 * 天气风险话术
 */
export interface WeatherRiskCopy {
  /** 情况说明 */
  situation: string;
  /** 可能性分析 */
  possibilities: string[];
  /** 准备建议 */
  preparations: string[];
  /** 赋能信息 */
  empowerment: string;
}

/**
 * 错误话术
 */
export interface ErrorCopy {
  /** 错误标题 */
  title: string;
  /** 错误描述（用户友好） */
  description: string;
  /** 可能原因 */
  possibleReasons: string[];
  /** 解决建议 */
  suggestions: string[];
  /** 技术支持信息 */
  supportInfo?: string;
}

/**
 * 异常话术
 */
export interface ExceptionCopy {
  /** 异常类型 */
  type: string;
  /** 用户友好的消息 */
  userFriendlyMessage: string;
  /** 技术细节（可选） */
  technicalDetails?: string;
  /** 下一步行动 */
  nextSteps: string[];
}
