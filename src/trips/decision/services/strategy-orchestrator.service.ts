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
import { AbuStrategy } from '../strategies/abu-strategy.service';
import { DrDreStrategy } from '../strategies/dr-dre-strategy.service';
import { NeptuneStrategy } from '../strategies/neptune-strategy.service';
import {
  WorldModelContext,
  RoutePlanDraft,
} from '../shared/world-model.types';
import { DecisionResult, DecisionLogEntry } from '../shared/decision-result.types';
import { DecisionLogStorageService } from './decision-log-storage.service';

/**
 * 策略编排结果
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
}

@Injectable()
export class StrategyOrchestratorService {
  private readonly logger = new Logger(StrategyOrchestratorService.name);

  constructor(
    private readonly abu: AbuStrategy,
    private readonly dre: DrDreStrategy,
    private readonly nep: NeptuneStrategy,
    private readonly logStorage: DecisionLogStorageService,
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
    this.logger.debug(`开始策略编排: ${plan.tripId}`);

    const allLogs: DecisionLogEntry[] = [];
    let currentPlan: RoutePlanDraft = plan;

    // 1️⃣ Abu 评估（安全否决者）
    this.logger.debug('执行 Abu 策略...');
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
    const dreResult = await this.dre.evaluate(world, currentPlan);
    allLogs.push(...dreResult.logs);

    // 如果 Dr.Dre 调整了计划，使用调整后的计划
    if (dreResult.updatedPlan) {
      currentPlan = dreResult.updatedPlan;
      this.logger.debug(`Dr.Dre 调整了计划: ${dreResult.action}`);
    }

    // 3️⃣ Neptune 评估（空间修复者）
    this.logger.debug('执行 Neptune 策略...');
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

    // 5️⃣ 保存决策日志到数据库（异步，不阻塞主流程）
    this.saveLogs(allLogs, world, plan).catch(error => {
      this.logger.warn(`Failed to save decision logs: ${error}`);
    });

    return {
      plan: currentPlan,
      logs: allLogs,
      allowed: true,
      finalAction,
    };
  }

  /**
   * 保存决策日志到数据库
   */
  private async saveLogs(
    logs: DecisionLogEntry[],
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<void> {
    if (logs.length === 0) {
      return;
    }

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
}

