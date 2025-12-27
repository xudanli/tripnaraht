// src/trips/decision/shared/decision-result.types.ts
/**
 * Decision Result + Log Types
 * 
 * 决策结果和日志的统一输出契约
 */

import { RoutePlanDraft } from './world-model.types';

/**
 * 决策动作
 */
export type DecisionAction =
  | 'ALLOW'
  | 'REJECT'
  | 'ADJUST'
  | 'REPLACE';

/**
 * 决策人格
 */
export type DecisionPersona = 'ABU' | 'DR_DRE' | 'NEPTUNE';

/**
 * 决策来源
 * 
 * 用于量化 TripNARA 有多少判断是基于现实
 * - PHYSICAL: 基于物理现实（DEM、道路、天气、危险区域）
 * - HUMAN: 基于人体能力（体能、节奏、高海拔适应）
 * - PHILOSOPHY: 基于路线哲学（核心体验、不可协商规则）
 * - HEURISTIC: 基于启发式规则（经验、默认值）
 */
export type DecisionSource = "PHYSICAL" | "HUMAN" | "PHILOSOPHY" | "HEURISTIC";

/**
 * 决策日志条目
 */
export interface DecisionLogEntry {
  persona: DecisionPersona;
  action: DecisionAction;
  explanation: string;
  reasonCodes: string[];
  evidenceRefs?: string[]; // 引用的证据 ID
  timestamp: string;
  /** 决策来源（第一性原理追踪） */
  decisionSource: DecisionSource;
}

/**
 * 决策结果
 */
export interface DecisionResult {
  allowed: boolean;
  action: DecisionAction;
  updatedPlan?: RoutePlanDraft;
  logs: DecisionLogEntry[];
}

