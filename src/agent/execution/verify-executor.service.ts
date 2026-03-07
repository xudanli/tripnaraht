/**
 * VerifyExecutorService
 *
 * 实现 IVerifyExecutor，执行 VERIFY 阶段
 * 1. 调用 itinerary.verify Skill
 * 2. 调用 ExperienceAgent.assessHumanExecutability（专利实施例：体验与人体可执行性评估）
 *
 * 参考: docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { IVerifyExecutor, PhaseExecutorContext } from '../../decision/kernel/interfaces/phase-executor.interface';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { ExperienceAgentService } from '../services/domain-agents/experience-agent.service';
import type { Itinerary } from '../interfaces/trip-plan.interface';

@Injectable()
export class VerifyExecutorService implements IVerifyExecutor {
  private readonly logger = new Logger(VerifyExecutorService.name);

  constructor(
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly experienceAgent?: ExperienceAgentService,
  ) {}

  async execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{ issues: string[]; confidenceDelta: number }> {
    this.logger.debug(`[VerifyExecutor] 执行 VERIFY 阶段 requestId=${ctx.requestId}`);

    const issues: string[] = [];
    let confidenceDelta = 0;

    // 1. itinerary.verify Skill
    if (this.skillsRegistry && ctx.itinerary) {
      try {
        const skill = this.skillsRegistry.getSkill('itinerary.verify');
        if (skill) {
          const result = await skill.execute({
            itinerary: ctx.itinerary as any,
            research_data: ctx.researchData,
          });

          if (result?.issues && Array.isArray(result.issues)) {
            issues.push(...result.issues);
            confidenceDelta = -0.1 * Math.min(issues.length, 5);
          }
        }
      } catch (e: any) {
        this.logger.warn(`[VerifyExecutor] itinerary.verify 失败: ${e?.message}`);
        issues.push(e?.message || '验证失败');
        confidenceDelta = -0.2;
      }
    }

    // 2. ExperienceAgent.assessHumanExecutability（专利实施例：体验评估）
    if (this.experienceAgent && ctx.itinerary && this.hasValidItinerary(ctx.itinerary)) {
      try {
        const userProfile = this.deriveUserProfile(ctx);
        const execResult = await this.experienceAgent.assessHumanExecutability(
          ctx.itinerary as unknown as Itinerary,
          userProfile,
        );

        // DIFFICULT/EXTREME 挑战点转为 issues
        const severeChallenges = (execResult.challenge_points || []).filter(
          (c) => c.severity === 'DIFFICULT' || c.severity === 'EXTREME',
        );
        for (const c of severeChallenges) {
          issues.push(`[体验评估] ${c.challenge} (${c.severity})，建议：${c.adaptation}`);
        }

        // 可执行性得分过低时降低置信度
        if (execResult.executability_score < 50) {
          confidenceDelta -= 0.15;
          issues.push(
            `[体验评估] 人体可执行性较低 (${execResult.executability_score}/100)，行程强度可能超过用户体能`,
          );
        } else if (execResult.executability_score < 70 && severeChallenges.length > 0) {
          confidenceDelta -= 0.05;
        }

        this.logger.debug(
          `[VerifyExecutor] ExperienceAgent 可执行性=${execResult.executability_score} challenges=${severeChallenges.length}`,
        );
      } catch (e: any) {
        this.logger.warn(`[VerifyExecutor] ExperienceAgent.assessHumanExecutability 失败: ${e?.message}`);
      }
    }

    if (issues.length > 0 && confidenceDelta === 0) {
      confidenceDelta = -0.1 * Math.min(issues.length, 5);
    }

    return { issues, confidenceDelta };
  }

  private hasValidItinerary(itinerary: PhaseExecutorContext['itinerary']): boolean {
    return !!(itinerary?.days && Array.isArray(itinerary.days) && itinerary.days.length > 0);
  }

  private deriveUserProfile(ctx: PhaseExecutorContext): {
    fitness_level: 'LOW' | 'MEDIUM' | 'HIGH';
    age_group?: string;
    special_needs?: string[];
  } {
    const party = ctx.tripPlanRequest?.party;
    const profile = ctx.tripPlanRequest?.party_profile;
    const raw = (party?.fitness_level ?? profile?.fitness ?? 'medium')?.toString().toUpperCase();
    const fitness_level: 'LOW' | 'MEDIUM' | 'HIGH' =
      raw === 'LOW' || raw === 'HIGH' ? raw : 'MEDIUM';

    return {
      fitness_level,
      age_group: party?.has_elderly ? 'senior' : undefined,
      special_needs: [],
    };
  }
}
