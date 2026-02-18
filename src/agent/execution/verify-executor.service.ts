/**
 * VerifyExecutorService
 *
 * 实现 IVerifyExecutor，执行 VERIFY 阶段
 * 调用 itinerary.verify Skill
 *
 * 参考: docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { IVerifyExecutor, PhaseExecutorContext } from '../../decision/kernel/interfaces/phase-executor.interface';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';

@Injectable()
export class VerifyExecutorService implements IVerifyExecutor {
  private readonly logger = new Logger(VerifyExecutorService.name);

  constructor(@Optional() private readonly skillsRegistry?: SkillsRegistryService) {}

  async execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{ issues: string[]; confidenceDelta: number }> {
    this.logger.debug(`[VerifyExecutor] 执行 VERIFY 阶段 requestId=${ctx.requestId}`);

    const issues: string[] = [];
    let confidenceDelta = 0;

    if (!this.skillsRegistry || !ctx.itinerary) {
      return { issues, confidenceDelta };
    }

    try {
      const skill = this.skillsRegistry.getSkill('itinerary.verify');
      if (!skill) return { issues, confidenceDelta };

      const result = await skill.execute({
        itinerary: ctx.itinerary as any,
        research_data: ctx.researchData,
      });

      if (result?.issues && Array.isArray(result.issues)) {
        issues.push(...result.issues);
        confidenceDelta = -0.1 * Math.min(issues.length, 5);
      }
    } catch (e: any) {
      this.logger.warn(`[VerifyExecutor] itinerary.verify 失败: ${e?.message}`);
      issues.push(e?.message || '验证失败');
      confidenceDelta = -0.2;
    }

    return { issues, confidenceDelta };
  }
}
