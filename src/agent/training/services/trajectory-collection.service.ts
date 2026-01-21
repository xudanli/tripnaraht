// src/agent/training/services/trajectory-collection.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApprovalStatus } from '@prisma/client';
import {
  TrajectoryCollectionData,
  TrajectoryUpdateData,
  ExecutionResult,
} from '../interfaces/trajectory.interface';
import { TrajectoryValidatorService } from './trajectory-validator.service';
import { RewardSignalExtractorService } from './reward-signal-extractor.service';
import { RollTrajectoryAdapterService } from './roll-trajectory-adapter.service';
import { GateResult } from '../../interfaces/trip-plan.interface';
import { RewardSignal } from '../interfaces/trajectory.interface';

/**
 * TrajectoryCollectionService
 * 
 * 职责：收集和存储轨迹数据
 */
@Injectable()
export class TrajectoryCollectionService {
  private readonly logger = new Logger(TrajectoryCollectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: TrajectoryValidatorService,
    private readonly rewardExtractor: RewardSignalExtractorService,
    @Optional() private readonly rollTrajectoryAdapter?: RollTrajectoryAdapterService,
  ) {}

  /**
   * 收集轨迹（PLAN_GEN 完成后调用）
   */
  async collectTrajectory(
    data: TrajectoryCollectionData,
  ): Promise<{ trajectoryId: string; status: string }> {
    this.logger.debug(
      `[TrajectoryCollection] 收集轨迹: requestId=${data.requestId}`,
    );

    try {
      // 生成轨迹ID
      const trajectoryId = `traj_${data.requestId}_${Date.now()}`;

      // 验证轨迹
      const validationResult = await this.validator.validateTrajectory(
        data.gateResult,
        data.complianceResult,
      );

      // 存储轨迹（初始状态为 PENDING，等待用户审批和执行结果）
      const trajectory = await this.prisma.validatedTrajectory.create({
        data: {
          trajectoryId,
          requestId: data.requestId,
          tripId: data.tripId,
          validationStatus: validationResult.isValid ? 'VALIDATED' : 'REJECTED',
          validationScore: validationResult.score,
          validationReasons: validationResult.reasons,
          plan: data.plan as any,
          decisionTrace: data.decisionTrace as any,
          researchData: data.researchData as any,
          gateResult: data.gateResult as any,
          complianceResult: data.complianceResult as any,
          modelVersion: data.modelVersion || 'v1.0',
          countryCode: data.countryCode,
        },
      });

      this.logger.log(
        `[TrajectoryCollection] 轨迹已收集: trajectoryId=${trajectoryId}, status=${trajectory.validationStatus}`,
      );

      return {
        trajectoryId,
        status: trajectory.validationStatus,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrajectoryCollection] 收集轨迹失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 更新轨迹（用户审批后调用）
   */
  async updateTrajectoryWithApproval(
    trajectoryId: string,
    userApproval: ApprovalStatus,
  ): Promise<void> {
    this.logger.debug(
      `[TrajectoryCollection] 更新轨迹审批状态: trajectoryId=${trajectoryId}, approval=${userApproval}`,
    );

    try {
      const trajectory = await this.prisma.validatedTrajectory.findUnique({
        where: { trajectoryId },
      });

      if (!trajectory) {
        throw new Error(`轨迹不存在: ${trajectoryId}`);
      }

      // 重新验证轨迹（包含用户审批信息）
      const validationResult = await this.validator.validateTrajectory(
        trajectory.gateResult as unknown as GateResult,
        trajectory.complianceResult as any,
        userApproval,
      );

      // 提取 reward 信号
      const approvalRewardSignals = this.rewardExtractor.extractFromApproval(userApproval);
      
      // 合并现有的 reward 信号（如果有）
      const existingRewardSignals = (trajectory.rewardSignals as unknown as RewardSignal[]) || [];
      const mergedRewardSignals = this.rewardExtractor.mergeSignals(
        existingRewardSignals,
        approvalRewardSignals,
      );
      const totalReward = this.rewardExtractor.calculateTotalReward(mergedRewardSignals);

      // 更新轨迹
      await this.prisma.validatedTrajectory.update({
        where: { trajectoryId },
        data: {
          userApproval,
          validationStatus: validationResult.isValid ? 'VALIDATED' : 'REJECTED',
          validationScore: validationResult.score,
          validationReasons: validationResult.reasons,
          rewardSignals: mergedRewardSignals as any,
          totalReward,
        },
      });

      this.logger.log(
        `[TrajectoryCollection] 轨迹审批状态已更新: trajectoryId=${trajectoryId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `[TrajectoryCollection] 更新轨迹审批状态失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 更新轨迹（执行完成后调用）
   */
  async updateTrajectoryWithExecution(
    trajectoryId: string,
    executionResult: ExecutionResult,
  ): Promise<void> {
    this.logger.debug(
      `[TrajectoryCollection] 更新轨迹执行结果: trajectoryId=${trajectoryId}, success=${executionResult.success}`,
    );

    try {
      const trajectory = await this.prisma.validatedTrajectory.findUnique({
        where: { trajectoryId },
      });

      if (!trajectory) {
        throw new Error(`轨迹不存在: ${trajectoryId}`);
      }

      // 重新验证轨迹（包含执行结果）
      const userApproval = trajectory.userApproval
        ? (trajectory.userApproval as ApprovalStatus)
        : undefined;

      const validationResult = await this.validator.validateTrajectory(
        trajectory.gateResult as unknown as GateResult,
        trajectory.complianceResult as any,
        userApproval,
        executionResult,
      );

      // 提取 reward 信号
      const executionRewardSignals = this.rewardExtractor.extractFromExecution(executionResult);
      
      // 合并现有的 reward 信号（如果有）
      const existingRewardSignals = (trajectory.rewardSignals as unknown as RewardSignal[]) || [];
      const mergedRewardSignals = this.rewardExtractor.mergeSignals(
        existingRewardSignals,
        executionRewardSignals,
      );
      const totalReward = this.rewardExtractor.calculateTotalReward(mergedRewardSignals);

      // 更新轨迹
      await this.prisma.validatedTrajectory.update({
        where: { trajectoryId },
        data: {
          executionResult: executionResult as any,
          validationStatus: validationResult.isValid ? 'VALIDATED' : 'REJECTED',
          validationScore: validationResult.score,
          validationReasons: validationResult.reasons,
          rewardSignals: mergedRewardSignals as any,
          totalReward,
        },
      });

      this.logger.log(
        `[TrajectoryCollection] 轨迹执行结果已更新: trajectoryId=${trajectoryId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `[TrajectoryCollection] 更新轨迹执行结果失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 根据 requestId 查找轨迹
   */
  async findTrajectoryByRequestId(
    requestId: string,
  ): Promise<{ trajectoryId: string | null }> {
    const trajectory = await this.prisma.validatedTrajectory.findFirst({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
      select: { trajectoryId: true },
    });

    return {
      trajectoryId: trajectory?.trajectoryId || null,
    };
  }
}
