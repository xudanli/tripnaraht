// src/agent/interfaces/sub-agent.interface.ts

/**
 * 子 Agent 接口定义（基于 claude.md）
 * 
 * 规则：Orchestrator 拥有状态机并按顺序调用；
 * 子 Agent 只输出结构化 JSON 片段，由 Orchestrator 合并并写入 decision_log
 */

import { OrchestratorState, TripPlanRequest, GateResult, Itinerary, DecisionLogEntry } from './trip-plan.interface';

/**
 * Planner Agent
 * 
 * 职责：任务拆解、缺口清单、候选方案结构
 */
export interface PlannerAgent {
  /**
   * 解析请求并识别缺口
   */
  analyzeRequest(
    request: TripPlanRequest,
    context: OrchestratorState
  ): Promise<{
    intent: string;
    gaps: Array<{
      type: 'MISSING_DESTINATION' | 'MISSING_DATES' | 'MISSING_CONSTRAINTS' | 'MISSING_PREFERENCES';
      severity: 'HARD' | 'SOFT';
      detail: string;
    }>;
    candidate_structure?: {
      suggested_days: number;
      suggested_route?: string[];
      key_pois?: string[];
    };
  }>;
}

/**
 * Gatekeeper Agent
 * 
 * 职责：Should-Exist Gate 规则执行（硬门控+软评分）
 * 
 * 强制：Gate 在 Plan 之前执行
 */
export interface GatekeeperAgent {
  /**
   * 执行 Should-Exist Gate 评估
   */
  evaluateGate(
    request: TripPlanRequest,
    researchData: Record<string, any>,
    context: OrchestratorState
  ): Promise<GateResult>;
}

/**
 * Compliance Agent
 * 
 * 职责：风险提示/免责声明/用户确认留痕要求
 */
export interface ComplianceAgent {
  /**
   * 检查合规性并生成风险提示
   */
  checkCompliance(
    itinerary: Itinerary,
    gateResult: GateResult,
    context: OrchestratorState
  ): Promise<{
    risk_warnings: Array<{
      level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      category: 'SAFETY' | 'LEGAL' | 'HEALTH' | 'FINANCIAL' | 'LOGISTICS';
      message: string;
      requires_user_confirmation: boolean;
    }>;
    disclaimers: string[];
    required_confirmations: string[];
  }>;
}

/**
 * LocalInsight Agent
 * 
 * 职责：替代点位/替代路线建议（无证据必须标 ASSUMPTION）
 */
export interface LocalInsightAgent {
  /**
   * 生成替代方案建议
   */
  suggestAlternatives(
    request: TripPlanRequest,
    gateResult: GateResult,
    context: OrchestratorState
  ): Promise<{
    alternative_pois: Array<{
      poi_id: string;
      name: string;
      reason: string;
      evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
      evidence_refs?: string[];
    }>;
    alternative_routes: Array<{
      route_id: string;
      description: string;
      reason: string;
      evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
      evidence_refs?: string[];
    }>;
  }>;
}

/**
 * CoreDecision Agent
 * 
 * 职责：多候选方案权衡与最终选择
 */
export interface CoreDecisionAgent {
  /**
   * 权衡多个候选方案并做出最终决策
   */
  makeDecision(
    candidates: Array<{
      itinerary: Itinerary;
      score: number;
      pros: string[];
      cons: string[];
      evidence_refs: string[];
    }>,
    request: TripPlanRequest,
    context: OrchestratorState
  ): Promise<{
    selected_itinerary: Itinerary;
    decision_reasoning: string;
    rejected_candidates: Array<{
      itinerary_id: string;
      reason: string;
    }>;
  }>;
}

/**
 * Narrator Agent
 * 
 * 职责：用户可读输出（不得更改硬字段与证据字段）
 */
export interface NarratorAgent {
  /**
   * 生成用户可读的解释和故事
   * 
   * 重要：不得修改 itinerary 的硬字段（时间、地点、证据等）
   */
  narrate(
    itinerary: Itinerary,
    gateResult: GateResult,
    decisionLog: DecisionLogEntry[],
    context: OrchestratorState
  ): Promise<{
    user_friendly_summary: string;
    day_by_day_narrative: Array<{
      day: number;
      date: string;
      narrative: string;
    }>;
    highlights: string[];
    tips: string[];
    warnings?: string[];
  }>;
}
