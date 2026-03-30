// src/content-strategy/interfaces/user-journey.interface.ts

/**
 * 用户旅程沟通策略接口定义
 * 
 * 基于 IMPLEMENTATION_PLAN_P0.md 的要求：
 * - 阶段一：模糊意向 → 兴趣激发
 * - 阶段二：信息探索 → 判断形成
 * - 阶段三：方案评估 → 决策倾向
 * - 阶段四：决策确认 → 行动启动
 */

/**
 * 阶段一响应：模糊意向 → 兴趣激发
 */
export interface Stage1Response {
  /** 首屏文案 */
  firstScreenCopy: string;
  /** 入门问卷 */
  onboardingQuestionnaire: {
    questions: Array<{
      id: string;
      question: string;
      type: 'single_choice' | 'multiple_choice' | 'text' | 'number';
      options?: string[];
      required: boolean;
    }>;
  };
  /** 快速反馈 */
  quickFeedback: {
    message: string;
    actions: Array<{
      label: string;
      action: string;
    }>;
  };
}

/**
 * 阶段二响应：信息探索 → 判断形成
 */
export interface Stage2Response {
  /** 信息卡片 */
  informationCards: Array<{
    type: 'BASIC_INFO' | 'CURRENT_CONDITIONS' | 'MATCHING' | 'RISK_OVERVIEW';
    title: string;
    content: any;
  }>;
  /** 对比工具 */
  comparisonTool: {
    routes: Array<{
      id: string;
      name: string;
      comparison: Record<string, any>;
    }>;
  };
  /** 风险坦诚 */
  riskHonesty: {
    risks: Array<{
      type: string;
      description: string;
      level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      preparation: string[];
    }>;
  };
  /** 来源标注 */
  sourceAnnotation: {
    sources: Array<{
      type: string;
      name: string;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
      url?: string;
    }>;
  };
}

/**
 * 阶段三响应：方案评估 → 决策倾向
 */
export interface Stage3Response {
  /** 匹配度分析 */
  matchingAnalysis: {
    overallScore: number;
    dimensions: Array<{
      dimension: string;
      score: number;
      explanation: string;
    }>;
    summary: string;
  };
  /** 可完成性评估 */
  feasibilityAssessment: {
    feasibility: 'FEASIBLE' | 'CONDITIONAL' | 'DIFFICULT' | 'NOT_FEASIBLE';
    factors: Array<{
      factor: string;
      status: 'PASS' | 'WARNING' | 'FAIL';
      explanation: string;
    }>;
    completionProbability?: number;
  };
  /** 成本-收益明晰化 */
  costBenefitClarification: {
    costs: Array<{
      category: string;
      amount: number;
      explanation: string;
    }>;
    benefits: Array<{
      category: string;
      value: string;
      explanation: string;
    }>;
    summary: string;
  };
  /** 决策反问 */
  decisionReflection: {
    questions: string[];
    considerations: string[];
  };
}

/**
 * 用户决策
 */
export interface UserDecision {
  /** 选择 */
  choice: 'GO' | 'NO_GO' | 'DEFER';
  /** 理由 */
  reasoning?: string;
  /** 信心度 */
  confidence?: number;
  /** 决策时间 */
  decisionTime?: Date;
}

/**
 * 阶段四响应：决策确认 → 行动启动
 */
export interface Stage4Response {
  /** 确认信息 */
  confirmation?: {
    message: string;
    nextSteps: Array<{
      step: string;
      description: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    preparationChecklist: string[];
  };
  /** 反决定回应 */
  noGoResponse?: {
    message: string;
    alternatives: string[];
    encouragement: string;
  };
  /** 延期回应 */
  deferResponse?: {
    message: string;
    suggestedTiming: string;
    preparationAdvice: string[];
  };
}
