// src/agent/utils/decision-log-migrator.util.ts

import { DecisionLogEntry, OrchestrationStep, SubAgentType } from '../interfaces/trip-plan.interface';

/**
 * 旧格式的决策日志条目（简化格式）
 * 
 * 用于向后兼容
 */
export interface LegacyDecisionLogEntry {
  step: string;
  decision: string;
  reasoning: string;
  timestamp: string;
}

/**
 * 决策日志格式迁移工具
 * 
 * 提供新旧格式之间的转换，支持向后兼容
 */
export class DecisionLogMigrator {
  /**
   * 将新格式转换为旧格式（兼容层）
   * 
   * 用于现有代码的向后兼容
   */
  static toLegacyFormat(entry: DecisionLogEntry): LegacyDecisionLogEntry {
    return {
      step: this.normalizeStepToLegacy(entry.step),
      decision: entry.outputs_summary,
      reasoning: entry.inputs_summary,
      timestamp: entry.timestamp,
    };
  }

  /**
   * 将旧格式转换为新格式（迁移工具）
   * 
   * 用于将旧格式的决策日志迁移到新格式
   */
  static fromLegacyFormat(
    entry: LegacyDecisionLogEntry,
    requestId: string,
  ): DecisionLogEntry {
    return {
      request_id: requestId,
      step: this.normalizeStepFromLegacy(entry.step),
      actor: this.inferActorFromStep(entry.step),
      inputs_summary: entry.reasoning || '',
      outputs_summary: entry.decision || '',
      evidence_refs: [],
      timestamp: entry.timestamp,
      metadata: {
        migrated: true,
        original_format: 'legacy',
      },
    };
  }

  /**
   * 批量转换新格式到旧格式
   */
  static batchToLegacyFormat(entries: DecisionLogEntry[]): LegacyDecisionLogEntry[] {
    return entries.map(entry => this.toLegacyFormat(entry));
  }

  /**
   * 批量转换旧格式到新格式
   */
  static batchFromLegacyFormat(
    entries: LegacyDecisionLogEntry[],
    requestId: string,
  ): DecisionLogEntry[] {
    return entries.map(entry => this.fromLegacyFormat(entry, requestId));
  }

  /**
   * 将新格式的步骤名转换为旧格式
   */
  private static normalizeStepToLegacy(step: OrchestrationStep): string {
    const stepMap: Record<OrchestrationStep, string> = {
      INTENT_COMPILE: 'intent_compile',
      INTAKE: 'intent_analysis',
      STATE_UPDATE: 'state_update',
      RESEARCH: 'research',
      POI_SELECTION: 'poi_selection',
      GATE_EVAL: 'gate_eval',
      CONTEXT_BUILD: 'context_build',
      PLAN_GEN: 'plan_gen',
      TRAVEL_COMPILE: 'travel_compile',
      OPTIMIZE: 'optimize',
      VERIFY: 'verify',
      COMPLIANCE: 'compliance',
      REPAIR: 'repair',
      NARRATE: 'narrate',
      FEEDBACK: 'feedback',
      HALLUCINATION_DETECTION: 'hallucination_detection',
      DONE: 'done',
      FAILED: 'failed',
      TIMEOUT: 'timeout',
    };
    return stepMap[step] || step.toLowerCase().replace('_', ' ');
  }

  /**
   * 将旧格式的步骤名转换为新格式
   */
  private static normalizeStepFromLegacy(step: string): OrchestrationStep {
    const stepMap: Record<string, OrchestrationStep> = {
      'intent analysis': 'INTAKE',
      'intent_analysis': 'INTAKE',
      'routing decision': 'INTAKE',
      'routing_decision': 'INTAKE',
      'state_update': 'STATE_UPDATE',
      'research': 'RESEARCH',
      'poi_selection': 'POI_SELECTION',
      'poi selection': 'POI_SELECTION',
      'gate eval': 'GATE_EVAL',
      'gate_eval': 'GATE_EVAL',
      'context_build': 'CONTEXT_BUILD',
      'plan gen': 'PLAN_GEN',
      'plan_gen': 'PLAN_GEN',
      'optimize': 'OPTIMIZE',
      'verify': 'VERIFY',
      'repair': 'REPAIR',
      'narrate': 'NARRATE',
      'done': 'DONE',
      'failed': 'FAILED',
      'error': 'FAILED',
      'timeout': 'TIMEOUT',
      'hallucination_detection': 'HALLUCINATION_DETECTION',
    };
    
    const normalized = step.toLowerCase().trim();
    return stepMap[normalized] || 'INTAKE';
  }

  /**
   * 从步骤名推断 Actor
   */
  private static inferActorFromStep(step: string): SubAgentType {
    const stepLower = step.toLowerCase();
    
    if (stepLower.includes('gate') || stepLower.includes('guardian')) {
      return 'Gatekeeper';
    }
    if (stepLower.includes('plan') || stepLower.includes('intent')) {
      return 'Planner';
    }
    if (stepLower.includes('narrate') || stepLower.includes('explain')) {
      return 'Narrator';
    }
    if (stepLower.includes('repair') || stepLower.includes('alternative')) {
      return 'LocalInsight';
    }
    if (stepLower.includes('verify') || stepLower.includes('pace')) {
      return 'CoreDecision';
    }
    
    return 'Orchestrator';
  }

  /**
   * 检查决策日志格式（新格式 or 旧格式）
   */
  static detectFormat(entry: any): 'new' | 'legacy' {
    // 新格式的特征：有 request_id、actor、inputs_summary、outputs_summary
    if (
      entry.request_id &&
      entry.actor &&
      entry.inputs_summary !== undefined &&
      entry.outputs_summary !== undefined
    ) {
      return 'new';
    }
    
    // 旧格式的特征：有 step、decision、reasoning
    if (
      entry.step &&
      entry.decision !== undefined &&
      entry.reasoning !== undefined
    ) {
      return 'legacy';
    }
    
    // 默认假设为新格式
    return 'new';
  }

  /**
   * 统一格式：将任意格式转换为新格式
   */
  static normalizeToNewFormat(
    entry: DecisionLogEntry | LegacyDecisionLogEntry,
    requestId: string,
  ): DecisionLogEntry {
    const format = this.detectFormat(entry);
    
    if (format === 'new') {
      return entry as DecisionLogEntry;
    }
    
    return this.fromLegacyFormat(entry as LegacyDecisionLogEntry, requestId);
  }

  /**
   * 统一格式：将任意格式转换为旧格式
   */
  static normalizeToLegacyFormat(
    entry: DecisionLogEntry | LegacyDecisionLogEntry,
  ): LegacyDecisionLogEntry {
    const format = this.detectFormat(entry);
    
    if (format === 'legacy') {
      return entry as LegacyDecisionLogEntry;
    }
    
    return this.toLegacyFormat(entry as DecisionLogEntry);
  }
}
