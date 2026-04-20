// src/trips/decision/services/strategy-orchestrator.service.ts
/**
 * Strategy Orchestrator Service
 * 
 * 策略编排服务：按顺序执行三人格策略
 * 
 * 调用顺序：
 * Abu → Dr.Dre → Neptune → Finalize
 */

import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AbuStrategy } from '../strategies/abu-strategy.service';
import { DrDreStrategy } from '../strategies/dr-dre-strategy.service';
import { NeptuneStrategy } from '../strategies/neptune-strategy.service';
import {
  WorldModelContext,
  RoutePlanDraft,
} from '../shared/world-model.types';
import { DecisionLogEntry } from '../shared/decision-result.types';
import { DecisionLogStorageService } from './decision-log-storage.service';
import { ContextEngineerService } from '../../../agent/context-engine/services/context-engineer.service';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';

/**
 * 策略编排结果
 * P2 E(U) 显式化：Dr.Dre 输出的 expectedUtility 透传
 */
export interface StrategyOrchestrationResult {
  /** 最终计划（如果被拒绝则为 null） */
  plan: RoutePlanDraft | null;
  /** 所有日志条目 */
  logs: DecisionLogEntry[];
  /** 是否通过所有检查 */
  allowed: boolean;
  /** 最终动作 */
  finalAction: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
  /** 期望效用 [0,1]（Dr.Dre 输出，专利 E(U) 显式化） */
  expectedUtility?: number;
  /** 效用权重摘要（可选） */
  expectedUtilityWeights?: Record<string, number>;
}

@Injectable()
export class StrategyOrchestratorService {
  private readonly logger = new Logger(StrategyOrchestratorService.name);
  private contextEngineer?: ContextEngineerService;
  private skillsRegistry?: SkillsRegistryService;

  constructor(
    private readonly abu: AbuStrategy,
    private readonly dre: DrDreStrategy,
    private readonly nep: NeptuneStrategy,
    private readonly logStorage: DecisionLogStorageService,
    private readonly moduleRef: ModuleRef, // 使用 ModuleRef 懒加载可选依赖
  ) {}

  /**
   * 运行策略编排
   * 
   * 按顺序执行：
   * 1. Abu（安全否决者）- 检查硬违规
   * 2. Dr.Dre（结构修复者）- 调整节奏
   * 3. Neptune（空间修复者）- 替换不可用路段
   * 
   * @param world 世界模型上下文
   * @param plan 路线计划草案
   * @returns 策略编排结果
   */
  async run(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<StrategyOrchestrationResult> {
    // 参数验证
    if (!world) {
      this.logger.error('WorldModelContext 不能为空');
      throw new Error('WorldModelContext 不能为空');
    }
    if (!plan) {
      this.logger.error('RoutePlanDraft 不能为空');
      throw new Error('RoutePlanDraft 不能为空');
    }

    this.logger.debug(`开始策略编排: ${plan.tripId || 'unknown'}`);

    const allLogs: DecisionLogEntry[] = [];
    let currentPlan: RoutePlanDraft = plan;

    // 1️⃣ Abu 评估（安全否决者）
    this.logger.debug('执行 Abu 策略...');
    
    // 为 Abu 构建上下文（如果 Context Engineer 可用）
    const contextEngineer = this.getContextEngineer();
    if (contextEngineer && plan.tripId) {
      try {
        const ctx = await contextEngineer.build({
          tripId: plan.tripId,
          phase: 'SAFETY_CHECK',
          agent: 'ABU',
          userQuery: `安全评估: ${plan.tripId}`,
          tokenBudget: 3000,
          requiredTopics: ['ABU_RULES', 'COUNTRY_SAFETY', 'COUNTRY_ROAD_RULES', 'REJECTION_LOG'],
        });
        this.logger.debug(`Abu Context Package: ${ctx.blocks.length} 个块, ${ctx.totalTokens} tokens`);
        // 注意：Abu 策略的 evaluate() 方法目前不接收上下文，但上下文已构建并可用于后续决策
      } catch (error: any) {
        this.logger.warn(`为 Abu 构建上下文失败: ${error.message}`);
      }
    }
    
    const abuResult = await this.abu.evaluate(world, currentPlan);
    allLogs.push(...abuResult.logs);

    if (!abuResult.allowed) {
      this.logger.warn(`Abu 拒绝了计划 ${plan.tripId}: ${abuResult.logs[0]?.explanation}`);
      return {
        plan: null,
        logs: allLogs,
        allowed: false,
        finalAction: 'REJECT',
      };
    }

    // 2️⃣ Dr.Dre 评估（结构修复者）
    this.logger.debug('执行 Dr.Dre 策略...');
    
    // 为 Dr.Dre 构建上下文（如果 Context Engineer 可用）
    if (contextEngineer && plan.tripId) {
      try {
        const ctx = await contextEngineer.build({
          tripId: plan.tripId,
          phase: 'PACING_ADJUSTMENT',
          agent: 'DR_DRE',
          userQuery: `节奏调整: ${plan.tripId}`,
          tokenBudget: 3000,
          requiredTopics: ['PLAN_DAY', 'PLAN_SEGMENT', 'DECISION_LOG'],
        });
        this.logger.debug(`Dr.Dre Context Package: ${ctx.blocks.length} 个块, ${ctx.totalTokens} tokens`);
      } catch (error: any) {
        this.logger.warn(`为 Dr.Dre 构建上下文失败: ${error.message}`);
      }
    }
    
    const dreResult = await this.dre.evaluate(world, currentPlan);
    allLogs.push(...dreResult.logs);

    // 如果 Dr.Dre 调整了计划，使用调整后的计划
    if (dreResult.updatedPlan) {
      currentPlan = dreResult.updatedPlan;
      this.logger.debug(`Dr.Dre 调整了计划: ${dreResult.action}`);
    }

    // 3️⃣ Neptune 评估（空间修复者）
    this.logger.debug('执行 Neptune 策略...');
    
    // 为 Neptune 构建上下文（如果 Context Engineer 可用）
    if (contextEngineer && plan.tripId) {
      try {
        const ctx = await contextEngineer.build({
          tripId: plan.tripId,
          phase: 'FINALIZING',
          agent: 'NEPTUNE',
          userQuery: `空间修复: ${plan.tripId}`,
          tokenBudget: 3000,
          requiredTopics: ['REJECTION_LOG', 'PLAN_SEGMENT', 'DECISION_LOG'],
        });
        this.logger.debug(`Neptune Context Package: ${ctx.blocks.length} 个块, ${ctx.totalTokens} tokens`);
      } catch (error: any) {
        this.logger.warn(`为 Neptune 构建上下文失败: ${error.message}`);
      }
    }
    
    const nepResult = await this.nep.evaluate(world, currentPlan);
    allLogs.push(...nepResult.logs);

    // 如果 Neptune 替换了计划，使用替换后的计划
    if (nepResult.updatedPlan) {
      currentPlan = nepResult.updatedPlan;
      this.logger.debug(`Neptune 替换了计划: ${nepResult.action}`);
    }

    // 4️⃣ 确定最终动作
    const finalAction = this.determineFinalAction(
      abuResult.action,
      dreResult.action,
      nepResult.action
    );

    this.logger.debug(`策略编排完成: ${finalAction}, 日志数: ${allLogs.length}`);

    // 5️⃣ 保存决策日志到数据库（使用 decision.logAppend skill，如果可用）
    this.saveLogs(allLogs, world, plan).catch(error => {
      this.logger.warn(`Failed to save decision logs: ${error}`);
    });

    return {
      plan: currentPlan,
      logs: allLogs,
      allowed: true,
      finalAction,
      expectedUtility: dreResult.expectedUtility,
      expectedUtilityWeights: dreResult.expectedUtilityWeights,
    };
  }

  /**
   * 保存决策日志到数据库（优先使用 decision.logAppend skill）
   */
  private async saveLogs(
    logs: DecisionLogEntry[],
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<void> {
    if (logs.length === 0) {
      return;
    }

    // 优先使用 decision.logAppend skill（如果可用）
    const skillsRegistry = this.getSkillsRegistry();
    if (skillsRegistry) {
      try {
        const decisionLogAppendSkill = skillsRegistry.getSkill('decision.logAppend');
        if (decisionLogAppendSkill) {
          const result = await decisionLogAppendSkill.execute({
            tripId: plan.tripId,
            countryCode: world.physical.countryCode,
            routeDirectionId: plan.routeDirectionId,
            entries: logs.map((log) => ({
              persona: log.persona,
              action: log.action,
              reasonCodes: log.reasonCodes,
              explanation: log.explanation,
              decisionSource: log.decisionSource,
              decisionStage: log.decisionStage,
              evidenceRefs: log.evidenceRefs,
              timestamp: log.timestamp,
              metadata: log.metadata,
              jepaTrace: log.jepaTrace as any,
            })),
            metadata: {
              month: world.physical.month,
            },
          });
          this.logger.debug(`使用 decision.logAppend skill 保存了 ${result.writtenCount} 条日志`);
          return;
        }
      } catch (error: any) {
        this.logger.warn(`使用 decision.logAppend skill 失败: ${error.message}，回退到直接保存`);
      }
    }

    // 回退到直接调用 DecisionLogStorageService
    await this.logStorage.saveLogEntries(logs, {
      tripId: plan.tripId,
      countryCode: world.physical.countryCode,
      routeDirectionId: plan.routeDirectionId,
      metadata: {
        month: world.physical.month,
      },
    });
  }

  /**
   * 确定最终动作
   * 
   * 优先级：REJECT > REPLACE > ADJUST > ALLOW
   */
  private determineFinalAction(
    abuAction: string,
    dreAction: string,
    nepAction: string
  ): 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE' {
    // Abu 已经检查过，如果到达这里说明 allowed = true
    // 所以 abuAction 应该是 ALLOW

    if (nepAction === 'REPLACE') {
      return 'REPLACE';
    }

    if (dreAction === 'ADJUST') {
      return 'ADJUST';
    }

    return 'ALLOW';
  }

  /**
   * 懒加载获取 ContextEngineerService
   * 避免在构造函数中注入，防止启动阻塞
   */
  private getContextEngineer(): ContextEngineerService | undefined {
    if (this.contextEngineer === undefined) {
      try {
        this.contextEngineer = this.moduleRef.get(ContextEngineerService, { strict: false });
        if (this.contextEngineer) {
          this.logger.debug('[StrategyOrchestratorService] 懒加载获取 ContextEngineerService 成功');
        } else {
          this.contextEngineer = null as any; // 标记为已尝试获取，但不可用
        }
      } catch (error) {
        this.logger.debug('[StrategyOrchestratorService] ContextEngineerService 不可用（懒加载失败）');
        this.contextEngineer = null as any; // 标记为已尝试获取
      }
    }
    return this.contextEngineer || undefined;
  }

  /**
   * 懒加载获取 SkillsRegistryService
   * 避免在构造函数中注入，防止启动阻塞
   */
  private getSkillsRegistry(): SkillsRegistryService | undefined {
    if (this.skillsRegistry === undefined) {
      try {
        this.skillsRegistry = this.moduleRef.get(SkillsRegistryService, { strict: false });
        if (this.skillsRegistry) {
          this.logger.debug('[StrategyOrchestratorService] 懒加载获取 SkillsRegistryService 成功');
        } else {
          this.skillsRegistry = null as any; // 标记为已尝试获取，但不可用
        }
      } catch (error) {
        this.logger.debug('[StrategyOrchestratorService] SkillsRegistryService 不可用（懒加载失败）');
        this.skillsRegistry = null as any; // 标记为已尝试获取
      }
    }
    return this.skillsRegistry || undefined;
  }
}

