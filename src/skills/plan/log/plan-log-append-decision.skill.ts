// src/skills/plan/log/plan-log-append-decision.skill.ts
/**
 * skill.plan.log.appendDecision
 * 
 * 目的：把每一次结论写成可追溯日志
 * 
 * System 1 技能：快速写入
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { DecisionLogRef } from '../shared/plan-state.types';

export interface PlanLogAppendDecisionInput extends SkillInput {
  /** 决策 ID */
  decision_id: string;
  
  /** 变更差异 */
  diff: any;
  
  /** 证据引用 */
  evidence_refs: string[];
  
  /** 规则版本 */
  rule_version: string;
  
  /** 决策者（可选） */
  decisionMaker?: string;
  
  /** 决策原因（可选） */
  reason?: string;
}

export interface PlanLogAppendDecisionOutput extends SkillOutput {
  /** 决策日志引用 */
  decisionLogRef: DecisionLogRef;
}

@Injectable()
export class PlanLogAppendDecisionSkill implements Skill<PlanLogAppendDecisionInput, PlanLogAppendDecisionOutput> {
  private readonly logger = new Logger(PlanLogAppendDecisionSkill.name);

  metadata = {
    name: 'plan.log.appendDecision',
    description: '把每一次结论写成可追溯日志',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: PlanLogAppendDecisionInput): Promise<PlanLogAppendDecisionOutput> {
    this.logger.debug(`执行 plan.log.appendDecision: decisionId=${input.decision_id}`);

    try {
      const decisionLogRef: DecisionLogRef = {
        decision_id: input.decision_id,
        diff: input.diff,
        evidence_refs: input.evidence_refs,
        rule_version: input.rule_version,
        timestamp: new Date().toISOString(),
      };

      // 这里可以写入数据库或日志系统
      this.logger.debug(`决策日志已记录: ${input.decision_id}`);

      return {
        decisionLogRef,
      };
    } catch (error: any) {
      this.logger.error(`记录决策日志失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
