// src/skills/decision/decision-run-three-guardians.skill.ts
/**
 * skill.decision.runThreeGuardians
 * 
 * 用途：一次性跑三人格，并给出结构化裁决。
 * 把现在分散的 abuCheck / drdrePace / neptuneRepair 做成一个「总调度」版本。
 * 
 * 输入：tripId 或已构建的 WorldModelContext + planCandidate
 * 输出：abuResult / drdreResult / neptuneResult + finalPlan + decisionSummary
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { WorldModelContext, RoutePlanDraft } from '../../trips/decision/shared/world-model.types';
import { StrategyOrchestratorService } from '../../trips/decision/services/strategy-orchestrator.service';
import { WorldBuildContextSkill } from '../world/world-build-context.skill';
import { PrismaService } from '../../prisma/prisma.service';

export interface DecisionRunThreeGuardiansInput extends SkillInput {
  /** 行程 ID（如果有） */
  tripId?: string;
  /** 或已构建的 WorldModelContext */
  world?: WorldModelContext;
  /** 候选计划 */
  planCandidate: RoutePlanDraft;
}

export interface DecisionRunThreeGuardiansOutput extends SkillOutput {
  /** Abu 检查结果 */
  abuResult: {
    allowed: boolean;
    violations: any[];
    decisionLog: any[];
  };
  /** Dr.Dre 调整结果 */
  drdreResult: {
    adjusted: boolean;
    adjustedPlan?: RoutePlanDraft;
    changes: any[];
    decisionLog: any[];
  };
  /** Neptune 修复结果 */
  neptuneResult: {
    repaired: boolean;
    repairedPlan?: RoutePlanDraft;
    replacements: any[];
    decisionLog: any[];
  };
  /** 最终计划 */
  finalPlan: RoutePlanDraft | null;
  /** 决策摘要（给 Agent 用的结构化摘要） */
  decisionSummary: {
    finalAction: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
    allowed: boolean;
    summary: string;
    keyDecisions: Array<{
      persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
      action: string;
      reason: string;
    }>;
  };
}

@Injectable()
export class DecisionRunThreeGuardiansSkill implements Skill<DecisionRunThreeGuardiansInput, DecisionRunThreeGuardiansOutput> {
  private readonly logger = new Logger(DecisionRunThreeGuardiansSkill.name);

  metadata = {
    name: 'decision.runThreeGuardians',
    description: '一次性执行三人格策略编排（Abu → Dr.Dre → Neptune），返回结构化决策结果和最终计划',
    version: '1.0.0',
    category: 'decision' as const,
  };

  constructor(
    private readonly strategyOrchestrator: StrategyOrchestratorService,
    private readonly worldBuildContext: WorldBuildContextSkill,
    private readonly prisma: PrismaService,
  ) {}

  async execute(input: DecisionRunThreeGuardiansInput): Promise<DecisionRunThreeGuardiansOutput> {
    this.logger.debug(`执行 decision.runThreeGuardians: tripId=${input.tripId || 'none'}`);

    try {
      // 1. 构建或使用 WorldModelContext
      let world: WorldModelContext;
      if (input.world) {
        world = input.world;
      } else if (input.tripId) {
        const contextResult = await this.worldBuildContext.execute({
          tripId: input.tripId,
        });
        world = contextResult.world;
      } else {
        throw new Error('必须提供 world 或 tripId');
      }

      // 2. 执行策略编排
      const result = await this.strategyOrchestrator.run(world, input.planCandidate);

      // 3. 分离三个守护者的结果
      const abuLogs = result.logs.filter(log => log.persona === 'ABU');
      const drdreLogs = result.logs.filter(log => log.persona === 'DR_DRE');
      const neptuneLogs = result.logs.filter(log => log.persona === 'NEPTUNE');

      // 4. 构建结构化输出
      const abuResult = {
        allowed: result.allowed,
        violations: abuLogs
          .filter(log => log.action === 'REJECT')
          .map(log => ({
            segmentId: log.evidenceRefs?.[0] || 'unknown',
            explanation: log.explanation,
            reasonCodes: log.reasonCodes || [],
          })),
        decisionLog: abuLogs.map(log => ({
          persona: log.persona,
          action: log.action,
          explanation: log.explanation,
          reasonCodes: log.reasonCodes || [],
          timestamp: log.timestamp,
        })),
      };

      const drdreResult = {
        adjusted: drdreLogs.some(log => log.action === 'ADJUST'),
        adjustedPlan: result.plan,
        changes: drdreLogs
          .filter(log => log.action === 'ADJUST')
          .map(log => ({
            type: log.action,
            explanation: log.explanation,
            metadata: log.evidenceRefs ? { evidenceRefs: log.evidenceRefs } : undefined,
          })),
        decisionLog: drdreLogs.map(log => ({
          persona: log.persona,
          action: log.action,
          explanation: log.explanation,
          reasonCodes: log.reasonCodes || [],
          timestamp: log.timestamp,
        })),
      };

      const neptuneResult = {
        repaired: neptuneLogs.some(log => log.action === 'REPLACE'),
        repairedPlan: result.plan,
        replacements: neptuneLogs
          .filter(log => log.action === 'REPLACE')
          .map(log => ({
            from: log.evidenceRefs?.[0],
            to: log.evidenceRefs?.[1],
            explanation: log.explanation,
            metadata: log.evidenceRefs ? { evidenceRefs: log.evidenceRefs } : undefined,
          })),
        decisionLog: neptuneLogs.map(log => ({
          persona: log.persona,
          action: log.action,
          explanation: log.explanation,
          reasonCodes: log.reasonCodes || [],
          timestamp: log.timestamp,
        })),
      };

      // 5. 生成决策摘要
      const keyDecisions = result.logs
        .filter(log => log.action !== 'ALLOW')
        .map(log => ({
          persona: log.persona as 'ABU' | 'DR_DRE' | 'NEPTUNE',
          action: log.action,
          reason: log.explanation,
        }));

      const decisionSummary = {
        finalAction: result.finalAction as 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE',
        allowed: result.allowed,
        summary: this.generateSummary(result),
        keyDecisions,
      };

      return {
        abuResult,
        drdreResult,
        neptuneResult,
        finalPlan: result.plan,
        decisionSummary,
      };
    } catch (error: any) {
      this.logger.error(`执行三人格策略失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private generateSummary(result: any): string {
    if (!result.allowed) {
      return `Abu 拒绝了计划：${result.logs.find(log => log.persona === 'ABU' && log.action === 'REJECT')?.explanation || '安全检查未通过'}`;
    }

    const actions = [];
    if (result.logs.some(log => log.persona === 'DR_DRE' && log.action === 'ADJUST')) {
      actions.push('Dr.Dre 调整了行程节奏');
    }
    if (result.logs.some(log => log.persona === 'NEPTUNE' && log.action === 'REPLACE')) {
      actions.push('Neptune 替换了部分路段');
    }
    if (actions.length === 0) {
      return '计划通过所有检查，无需调整';
    }

    return `计划已优化：${actions.join('，')}`;
  }
}

