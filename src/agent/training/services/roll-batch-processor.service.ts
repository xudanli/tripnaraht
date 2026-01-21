// src/agent/training/services/roll-batch-processor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RollClientService } from './roll-client.service';

/**
 * 批量请求项
 */
interface BatchRequestItem<T> {
  id: string;
  request: T;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

/**
 * RollBatchProcessorService
 *
 * 职责：批量处理请求，提高吞吐量
 */
@Injectable()
export class RollBatchProcessorService {
  private readonly logger = new Logger(RollBatchProcessorService.name);
  private readonly batchSize: number;
  private readonly batchTimeout: number;

  // 批量队列
  private actorBatchQueue: BatchRequestItem<any>[] = [];
  private rewardBatchQueue: BatchRequestItem<any>[] = [];
  private policyBatchQueue: BatchRequestItem<any>[] = [];

  // 定时器
  private actorBatchTimer: NodeJS.Timeout | null = null;
  private rewardBatchTimer: NodeJS.Timeout | null = null;
  private policyBatchTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly rollClient: RollClientService,
  ) {
    this.batchSize = parseInt(
      this.configService.get<string>('ROLL_BATCH_SIZE') || '10',
      10,
    );
    this.batchTimeout = parseInt(
      this.configService.get<string>('ROLL_BATCH_TIMEOUT') || '100', // 100ms
      10,
    );
  }

  /**
   * 批量生成轨迹
   */
  async batchGenerateTrajectory(
    request: any,
  ): Promise<{ success: boolean; trajectory_id?: string; trajectory?: any; error?: string }> {
    return new Promise((resolve, reject) => {
      const item: BatchRequestItem<any> = {
        id: `actor-${Date.now()}-${Math.random()}`,
        request,
        resolve,
        reject,
      };

      this.actorBatchQueue.push(item);

      // 如果队列达到批量大小，立即处理
      if (this.actorBatchQueue.length >= this.batchSize) {
        this.processActorBatch();
      } else {
        // 否则设置定时器
        if (!this.actorBatchTimer) {
          this.actorBatchTimer = setTimeout(() => {
            this.processActorBatch();
          }, this.batchTimeout);
        }
      }
    });
  }

  /**
   * 批量计算奖励
   */
  async batchComputeReward(
    trajectory: any,
    rewardConfig?: any,
  ): Promise<{ success: boolean; reward?: number; error?: string }> {
    return new Promise((resolve, reject) => {
      const item: BatchRequestItem<any> = {
        id: `reward-${Date.now()}-${Math.random()}`,
        request: { trajectory, rewardConfig },
        resolve,
        reject,
      };

      this.rewardBatchQueue.push(item);

      if (this.rewardBatchQueue.length >= this.batchSize) {
        this.processRewardBatch();
      } else {
        if (!this.rewardBatchTimer) {
          this.rewardBatchTimer = setTimeout(() => {
            this.processRewardBatch();
          }, this.batchTimeout);
        }
      }
    });
  }

  /**
   * 批量策略预测
   */
  async batchPredict(
    state: any,
  ): Promise<{ success: boolean; action?: string; confidence?: number; error?: string }> {
    return new Promise((resolve, reject) => {
      const item: BatchRequestItem<any> = {
        id: `policy-${Date.now()}-${Math.random()}`,
        request: state,
        resolve,
        reject,
      };

      this.policyBatchQueue.push(item);

      if (this.policyBatchQueue.length >= this.batchSize) {
        this.processPolicyBatch();
      } else {
        if (!this.policyBatchTimer) {
          this.policyBatchTimer = setTimeout(() => {
            this.processPolicyBatch();
          }, this.batchTimeout);
        }
      }
    });
  }

  /**
   * 处理 Actor 批量请求
   */
  private async processActorBatch(): Promise<void> {
    if (this.actorBatchTimer) {
      clearTimeout(this.actorBatchTimer);
      this.actorBatchTimer = null;
    }

    if (this.actorBatchQueue.length === 0) {
      return;
    }

    const batch = this.actorBatchQueue.splice(0, this.batchSize);
    this.logger.debug(`[RollBatch] 处理 Actor 批量请求: ${batch.length} 项`);

    // 并行处理批量请求
    const promises = batch.map((item) =>
      this.rollClient
        .callActorWorker(item.request)
        .then((result) => item.resolve(result))
        .catch((error) => item.reject(error)),
    );

    await Promise.allSettled(promises);
  }

  /**
   * 处理 Reward 批量请求
   */
  private async processRewardBatch(): Promise<void> {
    if (this.rewardBatchTimer) {
      clearTimeout(this.rewardBatchTimer);
      this.rewardBatchTimer = null;
    }

    if (this.rewardBatchQueue.length === 0) {
      return;
    }

    const batch = this.rewardBatchQueue.splice(0, this.batchSize);
    this.logger.debug(`[RollBatch] 处理 Reward 批量请求: ${batch.length} 项`);

    const promises = batch.map((item) =>
      this.rollClient
        .callRewardWorker(item.request.trajectory, item.request.rewardConfig)
        .then((result) => item.resolve(result))
        .catch((error) => item.reject(error)),
    );

    await Promise.allSettled(promises);
  }

  /**
   * 处理 Policy 批量请求
   */
  private async processPolicyBatch(): Promise<void> {
    if (this.policyBatchTimer) {
      clearTimeout(this.policyBatchTimer);
      this.policyBatchTimer = null;
    }

    if (this.policyBatchQueue.length === 0) {
      return;
    }

    const batch = this.policyBatchQueue.splice(0, this.batchSize);
    this.logger.debug(`[RollBatch] 处理 Policy 批量请求: ${batch.length} 项`);

    const promises = batch.map((item) =>
      this.rollClient
        .callPolicyWorker(item.request)
        .then((result) => item.resolve(result))
        .catch((error) => item.reject(error)),
    );

    await Promise.allSettled(promises);
  }
}
