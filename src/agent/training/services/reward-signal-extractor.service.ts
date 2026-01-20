// src/agent/training/services/reward-signal-extractor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ApprovalStatus } from '@prisma/client';
import { RewardSignal, ExecutionResult } from '../interfaces/trajectory.interface';

/**
 * RewardSignalExtractorService
 * 
 * 职责：从用户行为提取 reward 信号
 * 
 * Reward 信号来源（论文要求）：
 * 1. 用户审批 APPROVED → +1.0
 * 2. 用户审批 REJECTED → -0.5
 * 3. 规划工作台提交 → +0.8
 * 4. 决策对齐（alignmentScore）→ 0-1
 * 5. 执行成功 → +0.8
 */
@Injectable()
export class RewardSignalExtractorService {
  private readonly logger = new Logger(RewardSignalExtractorService.name);

  /**
   * 从用户审批提取 reward 信号
   */
  extractFromApproval(approval: ApprovalStatus): RewardSignal[] {
    this.logger.debug(`[RewardExtractor] 从审批提取reward: ${approval}`);

    const signals: RewardSignal[] = [];

    if (approval === ApprovalStatus.APPROVED) {
      signals.push({
        type: 'USER_APPROVAL',
        value: 1.0,
        timestamp: new Date().toISOString(),
        metadata: {
          approval_status: 'APPROVED',
        },
      });
    } else if (approval === ApprovalStatus.REJECTED) {
      signals.push({
        type: 'USER_APPROVAL',
        value: -0.5,
        timestamp: new Date().toISOString(),
        metadata: {
          approval_status: 'REJECTED',
        },
      });
    }

    this.logger.debug(
      `[RewardExtractor] 提取到 ${signals.length} 个reward信号，总值: ${signals.reduce((sum, s) => sum + s.value, 0)}`,
    );

    return signals;
  }

  /**
   * 从执行结果提取 reward 信号
   */
  extractFromExecution(executionResult: ExecutionResult): RewardSignal[] {
    this.logger.debug(
      `[RewardExtractor] 从执行结果提取reward: success=${executionResult.success}`,
    );

    const signals: RewardSignal[] = [];

    if (executionResult.success) {
      signals.push({
        type: 'EXECUTION_SUCCESS',
        value: 0.8,
        timestamp: new Date().toISOString(),
        metadata: {
          execution_success: true,
          error: executionResult.error || null,
        },
      });
    } else {
      // 执行失败，给予负奖励
      signals.push({
        type: 'EXECUTION_FAILURE',
        value: -0.3,
        timestamp: new Date().toISOString(),
        metadata: {
          execution_success: false,
          error: executionResult.error || 'Unknown error',
        },
      });
    }

    this.logger.debug(
      `[RewardExtractor] 提取到 ${signals.length} 个reward信号，总值: ${signals.reduce((sum, s) => sum + s.value, 0)}`,
    );

    return signals;
  }

  /**
   * 从规划工作台提交提取 reward 信号
   */
  extractFromPlanCommit(success: boolean): RewardSignal[] {
    this.logger.debug(`[RewardExtractor] 从规划提交提取reward: success=${success}`);

    const signals: RewardSignal[] = [];

    if (success) {
      signals.push({
        type: 'PLAN_COMMIT',
        value: 0.8,
        timestamp: new Date().toISOString(),
        metadata: {
          commit_success: true,
        },
      });
    }

    return signals;
  }

  /**
   * 从决策对齐分数提取 reward 信号
   */
  extractFromAlignmentScore(alignmentScore: number): RewardSignal[] {
    this.logger.debug(
      `[RewardExtractor] 从对齐分数提取reward: score=${alignmentScore}`,
    );

    // alignmentScore 应该在 0-1 范围内
    const normalizedScore = Math.max(0, Math.min(1, alignmentScore));

    return [
      {
        type: 'DECISION_ALIGNMENT',
        value: normalizedScore,
        timestamp: new Date().toISOString(),
        metadata: {
          alignment_score: normalizedScore,
        },
      },
    ];
  }

  /**
   * 合并多个 reward 信号，计算总 reward
   */
  calculateTotalReward(signals: RewardSignal[]): number {
    return signals.reduce((sum, signal) => sum + signal.value, 0);
  }

  /**
   * 合并多个 reward 信号数组
   */
  mergeSignals(...signalArrays: RewardSignal[][]): RewardSignal[] {
    return signalArrays.flat();
  }
}
