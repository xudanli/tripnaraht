/**
 * Decision OS 统一门面服务
 * 
 * 整合六元组 D=(S,A,T,C,R,Π) 所有组件，提供简化的高层 API
 * 
 * 专利实现：决策系统统一入口
 */

import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';

// 核心服务
import { ObjectiveFunctionService } from './objective-function.service';
import { ExpectedUtilityService } from './probabilistic/expected-utility.service';
import { ProbabilisticWorldModelService } from './probabilistic/probabilistic-world-model.service';

// 学习服务
import { PolicyNetworkService, ActionType, PolicyOutput } from './learning/policy-network.service';
import { OnlineLearningLoopService, DecisionOutcome } from './learning/online-learning-loop.service';
import { WeightLearnerService } from './learning/weight-learner.service';
import { RlhfPersistenceService } from './learning/rlhf-persistence.service';
import { DifferentiableDecisionService } from './differentiable/differentiable-decision.service';

// 审计和监控
import { DSOSnapshotAuditService, LyapunovTrace } from './learning/dso-snapshot-audit.service';
import { DecisionMetricsService } from './metrics/decision-metrics.service';

// 分布式锁
import { DistributedLockService } from '../../../redis/distributed-lock.service';
import { DEFAULT_OBJECTIVE_WEIGHTS } from './objective-function.interface';

// ========== 类型定义 ==========

export interface DecisionRequest {
  requestId: string;
  userId: string;
  dso: DecisionState;
  options?: {
    useMonteCarlo?: boolean;
    useExploration?: boolean;
    lockTimeout?: number;
  };
}

export interface DecisionResponse {
  requestId: string;
  recommendedAction: ActionType;
  actionProbabilities: Map<ActionType, number>;
  expectedUtility: number;
  confidence: number;
  policyEntropy: number;
  dsoVersion: number;
  latencyMs: number;
}

export interface FeedbackRequest {
  decisionId: string;
  userId: string;
  satisfactionScore?: number;
  actualUtility?: number;
  /** 决策时模型/系统给出的效用或置信标量 [0,1]，与 actualUtility 对齐后可算预测 regret */
  predictedUtility?: number;
  explicitFeedback?: { type: 'LIKE' | 'DISLIKE' | 'NEUTRAL'; comment?: string };
  behavioralSignals?: {
    completed: boolean;
    modificationCount: number;
    dwellTimeSeconds?: number;
  };
}

export interface FeedbackResponse {
  processed: boolean;
  learningTriggered: boolean;
  weightsUpdated: boolean;
  newConvergenceStatus?: string;
  /**
   * 预测–实现缺口（单侧 regret 代理）：max(0, predictedUtility − actualUtility)，域 [0,1]。
   * 仅当请求同时提供 `predictedUtility` 与 `actualUtility` 时返回。
   */
  predictionRegret01?: number;
}

export interface SystemStatus {
  healthy: boolean;
  components: {
    objectiveFunction: boolean;
    expectedUtility: boolean;
    policyNetwork: boolean;
    learningLoop: boolean;
    auditService: boolean;
    metricsService: boolean;
    lockService: boolean;
  };
  metrics: {
    totalDecisions: number;
    totalFeedback: number;
    totalUpdates: number;
    convergenceStatus: string;
  };
  uptime: number;
}

export interface StabilityReport {
  requestId: string;
  isStable: boolean;
  lyapunovTrace: LyapunovTrace;
  convergenceRate?: number;
  recommendation: string;
}

// ========== 门面服务 ==========

@Injectable()
export class DecisionOSFacadeService implements OnModuleInit {
  private readonly logger = new Logger(DecisionOSFacadeService.name);
  private startTime: number = Date.now();
  private requestCounter: number = 0;

  constructor(
    @Optional() private readonly objectiveFunction?: ObjectiveFunctionService,
    @Optional() private readonly expectedUtility?: ExpectedUtilityService,
    @Optional() private readonly worldModel?: ProbabilisticWorldModelService,
    @Optional() private readonly policyNetwork?: PolicyNetworkService,
    @Optional() private readonly learningLoop?: OnlineLearningLoopService,
    @Optional() private readonly weightLearner?: WeightLearnerService,
    @Optional() private readonly differentiable?: DifferentiableDecisionService,
    @Optional() private readonly auditService?: DSOSnapshotAuditService,
    @Optional() private readonly metricsService?: DecisionMetricsService,
    @Optional() private readonly lockService?: DistributedLockService,
    @Optional() private readonly rlhfPersistence?: RlhfPersistenceService,
  ) {}

  async onModuleInit() {
    this.logger.log('[DecisionOS] 门面服务初始化完成');
    this.logger.log(`[DecisionOS] 可用组件: ${this.getAvailableComponents().join(', ')}`);
  }

  /**
   * 执行完整决策流程
   * 
   * 流程: 获取锁 → 记录快照 → 策略推理 → 效用计算 → 记录指标 → 返回结果
   */
  async makeDecision(request: DecisionRequest): Promise<DecisionResponse> {
    const startTime = performance.now();
    const { requestId, userId, dso, options = {} } = request;

    this.requestCounter++;
    this.logger.debug(`[DecisionOS] 开始决策: requestId=${requestId}, userId=${userId}`);

    try {
      // 1. 获取分布式锁（可选）
      let lockHandle: any = null;
      if (this.lockService && options.lockTimeout) {
        const lockResult = await this.lockService.acquire(`decision:${requestId}`, {
          ttlMs: options.lockTimeout,
          maxRetries: 3,
        });
        if (lockResult.acquired) {
          lockHandle = lockResult.handle;
        }
      }

      try {
        // 2. 记录 DSO 快照
        let dsoVersion = dso.systemState?.version ?? 1;
        if (this.auditService) {
          const snapshot = await this.auditService.recordSnapshot(requestId, dso, {
            trigger: 'STATE_UPDATE',
          });
          dsoVersion = snapshot.version;
        }

        // 3. 策略网络推理
        let policyOutput: PolicyOutput;
        if (this.policyNetwork) {
          policyOutput = this.policyNetwork.computePolicy(dso, true);
        } else {
          policyOutput = this.getDefaultPolicy();
        }

        // 4. 计算期望效用（使用可微分服务或默认值）
        let expectedUtilityValue = 0.5;
        if (this.differentiable) {
          const embedding = this.differentiable.encodeDSO(dso);
          expectedUtilityValue = this.differentiable.computeUtility(embedding.z);
        }

        // 5. 记录决策到学习循环
        if (this.learningLoop) {
          this.learningLoop.recordDecision(requestId, userId, dso, expectedUtilityValue);
        }

        // 6. 记录指标
        const latencyMs = performance.now() - startTime;
        if (this.metricsService) {
          this.metricsService.recordDecisionLatency(latencyMs / 1000, dso.systemState?.currentPhase ?? 'UNKNOWN', 'success');
          this.metricsService.recordUtilityScore(expectedUtilityValue, 'decision');
          this.metricsService.setPolicyEntropy('6_actions', policyOutput.entropy);
          this.metricsService.setDSOVersion(requestId, dsoVersion);
        }

        const response: DecisionResponse = {
          requestId,
          recommendedAction: policyOutput.selectedAction,
          actionProbabilities: policyOutput.actionProbabilities,
          expectedUtility: expectedUtilityValue,
          confidence: policyOutput.confidence,
          policyEntropy: policyOutput.entropy,
          dsoVersion,
          latencyMs,
        };

        this.logger.debug(`[DecisionOS] 决策完成: action=${response.recommendedAction}, utility=${expectedUtilityValue.toFixed(3)}, latency=${latencyMs.toFixed(2)}ms`);

        return response;

      } finally {
        // 释放锁
        if (lockHandle && this.lockService) {
          await this.lockService.release(lockHandle);
        }
      }

    } catch (error) {
      const latencyMs = performance.now() - startTime;
      this.logger.error(`[DecisionOS] 决策失败: ${(error as Error).message}`);

      if (this.metricsService) {
        this.metricsService.recordDecisionLatency(latencyMs / 1000, dso.systemState?.currentPhase ?? 'UNKNOWN', 'failure');
      }

      throw error;
    }
  }

  /**
   * 处理用户反馈，触发学习
   */
  async processFeedback(request: FeedbackRequest): Promise<FeedbackResponse> {
    const { decisionId, userId, satisfactionScore, actualUtility, explicitFeedback, behavioralSignals } = request;

    this.logger.debug(`[DecisionOS] 处理反馈: decisionId=${decisionId}, userId=${userId}`);

    if (!this.learningLoop) {
      return { processed: false, learningTriggered: false, weightsUpdated: false };
    }

    const outcome: DecisionOutcome = {
      decisionId,
      userId,
      satisfactionScore,
      actualUtility,
      predictedUtility: request.predictedUtility,
      explicitFeedback,
      behavioralSignals,
      timestamp: new Date().toISOString(),
    };

    const result = await this.learningLoop.processDecisionOutcome(outcome);

    const predictionRegret01 = result.predictionRegret01;
    if (predictionRegret01 !== undefined) {
      this.logger.debug(
        `[DecisionOS] predictionRegret01=${predictionRegret01.toFixed(4)} pred=${request.predictedUtility} act=${request.actualUtility}`,
      );
      if (this.rlhfPersistence) {
        const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
        void this.rlhfPersistence
          .recordFeedback({
            userId,
            tripId: decisionId,
            feedbackType: 'PREDICTION_REGRET',
            feedbackData: {
              predictionRegret01,
              predictedUtility: request.predictedUtility,
              actualUtility: request.actualUtility,
              decisionId,
            },
            weightsAtTime: { ...DEFAULT_OBJECTIVE_WEIGHTS },
            utilityAtTime: clamp01(request.actualUtility!),
          })
          .catch((e: unknown) =>
            this.logger.warn(`[DecisionOS] RLHF PREDICTION_REGRET 持久化失败: ${(e as Error)?.message}`),
          );
      }
    }

    if (this.metricsService) {
      if (result.weightsUpdated) {
        this.metricsService.incrementLearningUpdate('FEEDBACK');
      }
    }

    const state = this.learningLoop.getState();

    return {
      processed: true,
      learningTriggered: result.learningTriggered,
      weightsUpdated: result.weightsUpdated,
      newConvergenceStatus: state.convergenceStatus,
      ...(predictionRegret01 !== undefined ? { predictionRegret01 } : {}),
    };
  }

  /**
   * 获取系统状态
   */
  getSystemStatus(): SystemStatus {
    const state = this.learningLoop?.getState() ?? {
      totalDecisions: 0,
      totalFeedback: 0,
      totalUpdates: 0,
      convergenceStatus: 'NOT_STARTED',
    };

    return {
      healthy: this.isHealthy(),
      components: {
        objectiveFunction: !!this.objectiveFunction,
        expectedUtility: !!this.expectedUtility,
        policyNetwork: !!this.policyNetwork,
        learningLoop: !!this.learningLoop,
        auditService: !!this.auditService,
        metricsService: !!this.metricsService,
        lockService: !!this.lockService,
      },
      metrics: {
        totalDecisions: state.totalDecisions,
        totalFeedback: state.totalFeedback,
        totalUpdates: state.totalUpdates,
        convergenceStatus: state.convergenceStatus,
      },
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * 获取稳定性报告
   */
  async getStabilityReport(requestId: string): Promise<StabilityReport | null> {
    if (!this.auditService) {
      return null;
    }

    const trace = await this.auditService.getLyapunovTrace(requestId);

    let recommendation: string;
    if (trace.values.length === 0) {
      recommendation = '无足够数据进行稳定性分析';
    } else if (trace.isDecreasing) {
      recommendation = '系统稳定，Lyapunov 函数单调递减';
    } else {
      recommendation = '警告：检测到 Lyapunov 函数非单调，可能存在稳定性问题';
    }

    return {
      requestId,
      isStable: trace.isDecreasing,
      lyapunovTrace: trace,
      convergenceRate: trace.convergenceRate,
      recommendation,
    };
  }

  /**
   * 获取学习统计
   */
  getLearningStatistics(): {
    regret: { cumulative: number; bound: number; rounds: number } | null;
    convergence: string;
    totalUpdates: number;
  } {
    const regretStats = this.learningLoop?.getRegretStatistics() ?? null;
    const state = this.learningLoop?.getState();

    return {
      regret: regretStats ? {
        cumulative: regretStats.cumulativeRegret,
        bound: regretStats.theoreticalBound,
        rounds: regretStats.totalRounds,
      } : null,
      convergence: state?.convergenceStatus ?? 'NOT_AVAILABLE',
      totalUpdates: state?.totalUpdates ?? 0,
    };
  }

  /**
   * 回滚 DSO 到指定版本
   */
  async rollbackDSO(requestId: string, targetVersion: number): Promise<DecisionState | null> {
    if (!this.auditService) {
      return null;
    }

    return this.auditService.rollback(requestId, targetVersion);
  }

  /**
   * 训练可微模型
   */
  async trainDifferentiableModel(
    samples: Array<{ dso: DecisionState; targetUtility: number }>,
    config?: { learningRate?: number; epochs?: number },
  ): Promise<{ loss: number; parametersUpdated: boolean }> {
    if (!this.differentiable) {
      return { loss: 0, parametersUpdated: false };
    }

    return this.differentiable.train(samples, {
      learningRate: config?.learningRate ?? 0.01,
    });
  }

  /**
   * 更新策略网络
   */
  updatePolicyNetwork(
    samples: Array<{ state: DecisionState; action: ActionType; reward: number }>,
  ): { loss: number; gradientNorm: number } {
    if (!this.policyNetwork) {
      return { loss: 0, gradientNorm: 0 };
    }

    return this.policyNetwork.updatePolicy(samples);
  }

  /**
   * 导出 Prometheus 指标
   */
  exportMetrics(): string {
    return this.metricsService?.exportPrometheusFormat() ?? '';
  }

  /**
   * 重置学习状态（用于测试）
   */
  resetLearningState(): void {
    this.learningLoop?.reset();
    this.requestCounter = 0;
    this.logger.log('[DecisionOS] 学习状态已重置');
  }

  // ========== 私有方法 ==========

  private isHealthy(): boolean {
    const criticalComponents = [
      this.policyNetwork,
      this.auditService,
    ];

    return criticalComponents.some(c => !!c);
  }

  private getAvailableComponents(): string[] {
    const components: string[] = [];
    if (this.objectiveFunction) components.push('ObjectiveFunction');
    if (this.expectedUtility) components.push('ExpectedUtility');
    if (this.worldModel) components.push('WorldModel');
    if (this.policyNetwork) components.push('PolicyNetwork');
    if (this.learningLoop) components.push('LearningLoop');
    if (this.weightLearner) components.push('WeightLearner');
    if (this.differentiable) components.push('Differentiable');
    if (this.auditService) components.push('AuditService');
    if (this.metricsService) components.push('MetricsService');
    if (this.lockService) components.push('LockService');
    return components;
  }

  private getDefaultPolicy(): PolicyOutput {
    const defaultProbs = new Map<ActionType, number>([
      ['ACCEPT_PLAN', 0.4],
      ['MODIFY_PLAN', 0.25],
      ['REGENERATE', 0.15],
      ['REQUEST_INFO', 0.1],
      ['RELAX_CONSTRAINT', 0.05],
      ['ESCALATE', 0.05],
    ]);

    return {
      selectedAction: 'ACCEPT_PLAN',
      actionProbabilities: defaultProbs,
      confidence: 0.4,
      entropy: 1.5,
    };
  }
}
