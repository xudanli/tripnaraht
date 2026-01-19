// src/content-strategy/interfaces/brand-story.interface.ts

/**
 * 品牌故事和内容素材接口定义
 * 
 * 基于 CONTENT_STRATEGY_COMPLIANCE.md 的要求：
 * - 品牌核心故事框架
 * - 用户故事素材库（从否定到接受、从风险到能力等）
 */

/**
 * 故事上下文
 */
export type StoryContext = 'first_screen' | 'copy_example' | 'user_education' | 'onboarding' | 'encouragement';

/**
 * 品牌核心故事
 */
export interface BrandStory {
  /** 问题 */
  problem: string;
  /** 角色 */
  character: string;
  /** 冲突 */
  conflict: string;
  /** 转折点 */
  turningPoint: string;
  /** 结果 */
  result: string;
  /** 启示 */
  revelation: string;
}

/**
 * 用户故事类型
 */
export type UserStoryType =
  | 'NEGATION_TO_ACCEPTANCE'
  | 'RISK_TO_CAPABILITY'
  | 'DOUBT_TO_CONFIDENCE'
  | 'FEAR_TO_COURAGE'
  | 'FAILURE_TO_LEARNING';

/**
 * 用户故事
 */
export interface UserStory {
  /** 故事类型 */
  type: UserStoryType;
  /** 标题 */
  title: string;
  /** 内容 */
  content: string;
  /** 关键点 */
  keyPoints: string[];
  /** 适用场景 */
  applicableScenarios: StoryContext[];
}

/**
 * 故事素材
 */
export interface StoryMaterial {
  /** 故事ID */
  id: string;
  /** 故事 */
  story: UserStory;
  /** 标签 */
  tags: string[];
  /** 使用次数 */
  usageCount?: number;
}

/**
 * 故事生成选项
 */
export interface StoryGenerationOptions {
  /** 上下文 */
  context: StoryContext;
  /** 用户画像 */
  userPersona?: 'RATIONAL_EXPLORER' | 'EXPERIENCE_SEEKER' | 'CONSERVATIVE_SAFETY';
  /** 主题 */
  theme?: string;
  /** 长度 */
  length?: 'SHORT' | 'MEDIUM' | 'LONG';
}
