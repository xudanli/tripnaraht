// src/skills/plan/log/plan-log-append-decision.skill.ts
/**
 * skill.plan.log.appendDecision
 *
 * 目的：把每一次结论写成可追溯日志
 */

import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { DecisionLogRef } from '../shared/plan-state.types';
import { DecisionLogStorageService } from '../../../trips/decision/services/decision-log-storage.service';
import type { DecisionLogEntry } from '../../../trips/decision/shared/decision-result.types';

export interface PlanLogAppendDecisionInput extends SkillInput {
  /** Trip ID（可选，用于持久化到 decision_log） */
  tripId?: string;

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

  /** 是否已写入 decision_log 表 */
  persisted: boolean;

  degraded?: boolean;
  degradedReason?: string;
}

@Injectable()
export class PlanLogAppendDecisionSkill implements Skill<PlanLogAppendDecisionInput, PlanLogAppendDecisionOutput> {
  private readonly logger = new Logger(PlanLogAppendDecisionSkill.name);
  private decisionLogStorage?: DecisionLogStorageService;

  metadata = {
    name: 'plan.log.appendDecision',
    description: '写入 plan 可追溯 decision log（结论、证据、版本）。在 plan/gate 产生用户可见结论后需审计留痕时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(private readonly moduleRef: ModuleRef) {}

  private getDecisionLogStorage(): DecisionLogStorageService | null {
    if (!this.decisionLogStorage) {
      try {
        this.decisionLogStorage = this.moduleRef.get(DecisionLogStorageService, { strict: false });
      } catch {
        return null;
      }
    }
    return this.decisionLogStorage ?? null;
  }

  async execute(input: PlanLogAppendDecisionInput): Promise<PlanLogAppendDecisionOutput> {
    this.logger.debug(`执行 plan.log.appendDecision: decisionId=${input.decision_id}`);

    const decisionLogRef: DecisionLogRef = {
      decision_id: input.decision_id,
      diff: input.diff,
      evidence_refs: input.evidence_refs,
      rule_version: input.rule_version,
      timestamp: new Date().toISOString(),
    };

    const storage = this.getDecisionLogStorage();
    if (!storage) {
      this.logger.warn('[plan.log.appendDecision] DecisionLogStorageService 不可用，仅返回内存引用');
      return {
        decisionLogRef,
        persisted: false,
        degraded: true,
        degradedReason: 'DecisionLogStorageService unavailable',
      };
    }

    const entry: DecisionLogEntry = {
      persona: 'USER_ACTION',
      action: 'EVALUATE',
      explanation: input.reason || `Plan decision ${input.decision_id}`,
      reasonCodes: ['plan.log.append'],
      evidenceRefs: input.evidence_refs,
      timestamp: decisionLogRef.timestamp,
      decisionSource: 'HEURISTIC',
      decisionStage: 'PLAN_EDIT',
      metadata: {
        planDecisionId: input.decision_id,
        diff: input.diff,
        rule_version: input.rule_version,
        decisionMaker: input.decisionMaker,
      },
    };

    await storage.saveLogEntry(entry, {
      tripId: input.tripId,
      metadata: {
        skill: 'plan.log.appendDecision',
        decision_id: input.decision_id,
      },
    });

    this.logger.debug(`决策日志已持久化: ${input.decision_id}`);

    return {
      decisionLogRef,
      persisted: true,
    };
  }
}
