// src/skills/decision/decision-neptune-repair.skill.ts
/**
 * skill.decision.neptuneRepair
 * 
 * 输入：{ world: WorldModelContext, brokenPlan, issue }
 * 输出：{ repairedPlan, replacements, philosophyCheck }
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { NeptuneStrategy } from '../../trips/decision/strategies/neptune-strategy.service';
import { WorldModelContext, RoutePlanDraft } from '../../trips/decision/shared/world-model.types';
import { DecisionResult } from '../../trips/decision/shared/decision-result.types';

export interface DecisionNeptuneRepairInput extends SkillInput {
  /** 世界模型上下文 */
  world: WorldModelContext;
  /** 损坏的计划 */
  brokenPlan: RoutePlanDraft;
  /** 问题描述（可选） */
  issue?: string;
}

export interface DecisionNeptuneRepairOutput extends SkillOutput {
  /** 修复后的计划 */
  repairedPlan: RoutePlanDraft | null;
  /** 替换操作列表 */
  replacements: Array<{
    type: string;
    originalId: string;
    newId: string;
    explanation: string;
  }>;
  /** 哲学检查结果 */
  philosophyCheck: {
    valid: boolean;
    violations?: string[];
  };
}

@Injectable()
export class DecisionNeptuneRepairSkill implements Skill<DecisionNeptuneRepairInput, DecisionNeptuneRepairOutput> {
  private readonly logger = new Logger(DecisionNeptuneRepairSkill.name);

  metadata = {
    name: 'decision.neptuneRepair',
    description: 'decision.neptuneRepair：Neptune 修复：在保持路线哲学下替换不可用路段、入口或 POI（仅 REPLACE，不改方向）。在 VERIFY/REPAIR 阶段 verify 报不可达或需 Plan B 换段时调用。',
    version: '1.0.0',
    category: 'decision' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly neptuneStrategy: NeptuneStrategy,
  ) {}

  async execute(input: DecisionNeptuneRepairInput): Promise<DecisionNeptuneRepairOutput> {
    this.logger.debug(`执行 decision.neptuneRepair: ${input.brokenPlan.tripId || 'unknown'}`);

    // 调用 Neptune Strategy
    const result: DecisionResult = await this.neptuneStrategy.evaluate(input.world, input.brokenPlan);

    // 提取替换操作
    const replacements: Array<{
      type: string;
      originalId: string;
      newId: string;
      explanation: string;
    }> = result.logs
      .filter(log => log.action === 'REPLACE')
      .map(log => ({
        type: log.reasonCodes?.[0] || 'UNKNOWN',
        originalId: log.evidenceRefs?.[0] || 'unknown',
        newId: log.evidenceRefs?.[1] || 'unknown',
        explanation: log.explanation,
      }));

    // 检查哲学违规
    const philosophyViolations = result.logs
      .filter(log => log.reasonCodes?.some(code => code.includes('PHILOSOPHY')))
      .map(log => log.explanation);

    return {
      repairedPlan: result.updatedPlan || null,
      replacements,
      philosophyCheck: {
        valid: philosophyViolations.length === 0,
        violations: philosophyViolations.length > 0 ? philosophyViolations : undefined,
      },
    };
  }
}

