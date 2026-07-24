// src/skills/decision/decision-drdre-pace.skill.ts
/**
 * skill.decision.drdrePace
 * 
 * 输入：{ world: WorldModelContext, draftPlan }
 * 输出：{ adjustedPlan, changes, reasonSummary }
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { DrDreStrategy } from '../../trips/decision/strategies/dr-dre-strategy.service';
import { WorldModelContext, RoutePlanDraft } from '../../trips/decision/shared/world-model.types';
import { DecisionResult } from '../../trips/decision/shared/decision-result.types';

export interface DecisionDrdrePaceInput extends SkillInput {
  /** 世界模型上下文 */
  world: WorldModelContext;
  /** 草案计划 */
  draftPlan: RoutePlanDraft;
}

export interface DecisionDrdrePaceOutput extends SkillOutput {
  /** 调整后的计划 */
  adjustedPlan: RoutePlanDraft | null;
  /** 变更列表 */
  changes: Array<{
    type: 'SPLIT_DAY' | 'BUFFER_DAY' | 'ADJUST_PACE';
    description: string;
    dayIndex?: number;
  }>;
  /** 原因摘要 */
  reasonSummary: string;
}

@Injectable()
export class DecisionDrdrePaceSkill implements Skill<DecisionDrdrePaceInput, DecisionDrdrePaceOutput> {
  private readonly logger = new Logger(DecisionDrdrePaceSkill.name);

  metadata = {
    name: 'decision.drdrePace',
    description: 'decision.drdrePace：基于人体能力模型调整行程节奏，可以拆分天数或插入缓冲日，但不能替换路线。',
    version: '1.0.0',
    category: 'decision' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly drDreStrategy: DrDreStrategy,
  ) {}

  async execute(input: DecisionDrdrePaceInput): Promise<DecisionDrdrePaceOutput> {
    const world = input?.world;
    const draftPlan = input?.draftPlan;
    if (!world || !draftPlan) {
      this.logger.warn(
        `decision.drdrePace: 缺少 world 或 draftPlan（world=${!!world}, draftPlan=${!!draftPlan}）；常见于上游 web.browse 等步骤失败导致上下文未注入`,
      );
      return {
        adjustedPlan: null,
        changes: [],
        reasonSummary:
          '节奏评估跳过：未收到草案计划或世界模型（上游步骤失败或未传入 trip 上下文）。',
      };
    }

    this.logger.debug(`执行 decision.drdrePace: ${draftPlan.tripId || 'unknown'}`);

    // 调用 Dr.Dre Strategy
    const result: DecisionResult = await this.drDreStrategy.evaluate(world, draftPlan);

    // 提取变更信息
    const changes: Array<{
      type: 'SPLIT_DAY' | 'BUFFER_DAY' | 'ADJUST_PACE';
      description: string;
      dayIndex?: number;
    }> = result.logs
      .filter(log => log.action === 'ADJUST' || log.action === 'REPLACE')
      .map(log => {
        const reasonCodes = log.reasonCodes || [];
        let type: 'SPLIT_DAY' | 'BUFFER_DAY' | 'ADJUST_PACE' = 'ADJUST_PACE';
        
        if (reasonCodes.some(c => c.includes('SPLIT'))) {
          type = 'SPLIT_DAY';
        } else if (reasonCodes.some(c => c.includes('BUFFER') || c.includes('REST'))) {
          type = 'BUFFER_DAY';
        }

        return {
          type,
          description: log.explanation,
          dayIndex: undefined, // 可以从 log.evidenceRefs 中提取
        };
      });

    // 生成原因摘要
    const reasonSummary = result.logs
      .map(log => log.explanation)
      .join('; ');

    return {
      adjustedPlan: result.updatedPlan || null,
      changes,
      reasonSummary,
    };
  }
}

