// src/trips/decision/interfaces/decision-log-enhanced.interface.ts
/**
 * Decision Log Enhanced - 系统级"责任账本"
 * 
 * PART A: 这是 TripNARA 与所有 LLM/OTA 的根本差异
 * ——你不只是给结果，你给"谁在什么依据下做了什么决定"。
 */

import { ISODatetime } from '../world-model';
import { DemDecisionEvidence } from './dem-decision-evidence.interface';
import { WeatherDecisionEvidence } from './weather-decision-evidence.interface';

/**
 * 决策步骤
 */
export type DecisionStep = 
  | 'ROUTE_DIRECTION'    // 路线方向选择
  | 'PLAN_GENERATION'    // 计划生成
  | 'PLAN_REPAIR'        // 计划修复
  | 'FINALIZE'           // 最终确认
  | 'REJECT';            // 拒绝

/**
 * 决策人格
 */
export type DecisionPersona = 'ABU' | 'DR_DRE' | 'NEPTUNE';

/**
 * 决策动作
 */
export type DecisionAction = 
  | 'ALLOW'      // 允许
  | 'REJECT'     // 拒绝
  | 'ADJUST'     // 调整
  | 'REPLACE';   // 替换

/**
 * 输入快照
 */
export interface InputSnapshot {
  userIntent: {
    destination: string;
    startDate: string;
    durationDays: number;
    preferences?: {
      pace?: 'relaxed' | 'moderate' | 'intense';
      riskTolerance?: 'low' | 'medium' | 'high';
      intents?: Record<string, number>;
    };
  };
  country: string;
  month: number;
  riskTolerance?: 'low' | 'medium' | 'high';
}

/**
 * 证据集合
 */
export interface DecisionEvidence {
  dem?: DemDecisionEvidence[];
  weather?: WeatherDecisionEvidence[];
  compliance?: {
    roadAccess?: boolean;
    permitRequired?: boolean;
    guideRequired?: boolean;
    vehicleRequired?: string;
  };
}

/**
 * 决策详情
 */
export interface DecisionDetails {
  action: DecisionAction;
  target?: string; // segmentId / poiId / dayIndex
  reasonCodes: string[];
  explanation: string;
  suggestedAlternatives?: string[]; // 替代方案
}

/**
 * 增强的决策日志（责任账本）
 * 
 * 这是 TripNARA 与所有 LLM/OTA 的根本差异
 */
export interface EnhancedDecisionLog {
  /** 日志 ID */
  logId: string;
  /** Trip ID */
  tripId?: string;
  /** 决策步骤 */
  step: DecisionStep;
  /** 决策人格 */
  persona: DecisionPersona;
  /** 时间戳 */
  timestamp: ISODatetime;

  /** 输入快照 */
  inputSnapshot: InputSnapshot;

  /** 证据集合 */
  evidence: DecisionEvidence;

  /** 决策详情 */
  decision: DecisionDetails;

  /** 原因代码（用于分类和统计） */
  reasonCodes: string[];

  /** 解释（用于用户展示） */
  explanation: string;

  /** 元数据 */
  metadata?: {
    /** 决策耗时（毫秒） */
    decisionTimeMs?: number;
    /** 是否影响最终计划 */
    impactsFinalPlan?: boolean;
    /** 相关 RouteDirection ID */
    routeDirectionId?: number;
  };
}

/**
 * 三人格的日志风格
 */
export interface PersonaLogStyle {
  /** 关键词 */
  keywords: string[];
  /** 解释模板 */
  explanationTemplate: string;
  /** 用户解释模板 */
  userExplanationTemplate: string;
}

/**
 * 三人格的日志风格定义
 * 
 * 形象设定：
 * - Abu（北极熊 🐻‍❄️）：严肃但温柔，不强求速度，永远把你带去安全地带
 *   Slogan: "我负责：这条路，真的能走吗？"
 * - Dr.Dre（牧羊犬 🐕）：体谅、节奏、稳定、贴心
 *   Slogan: "别太累，我会让每一天刚刚好。"
 * - Neptune（海獭 🦦）：聪明、灵活、创造性、共情
 *   Slogan: "如果行不通，我会给你一个刚刚好的替代。"
 */
export const PERSONA_LOG_STYLES: Record<DecisionPersona, PersonaLogStyle> = {
  ABU: {
    keywords: ['严肃但温柔', '保护', '安全地带', '冷静', '可信赖'],
    explanationTemplate: '{action}: {reasonCodes} - {explanation}',
    userExplanationTemplate: '我们没有选择这条路线，因为在 {affectedDays} 会出现 {reason}，这在当前季节和你的节奏偏好下存在明显风险。我负责把你带去安全地带，我们不会赌这件事。',
  },
  DR_DRE: {
    keywords: ['体谅', '节奏', '稳定', '贴心', '引导'],
    explanationTemplate: '{action}: {target} - {explanation}',
    userExplanationTemplate: '这条路线是可行的，但原本的节奏会让你在 {affectedPeriod} 明显疲劳。我已经帮你把 {adjustment}，让每一天刚刚好，体验更稳定。',
  },
  NEPTUNE: {
    keywords: ['聪明', '灵活', '创造性', '共情', '替代方案'],
    explanationTemplate: '{action}: {target} - {explanation}',
    userExplanationTemplate: '路线本身没有问题，只是 {originalPlan} 在你到达时不可用。我为你换了一个刚刚好的替代 {replacement}，你走的仍然是同一条路线，体验不会打折扣。',
  },
};

