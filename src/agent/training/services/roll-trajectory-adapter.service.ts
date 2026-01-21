// src/agent/training/services/roll-trajectory-adapter.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TrajectoryCollectionData,
} from '../interfaces/trajectory.interface';
import { RollClientService } from './roll-client.service';

/**
 * RollTrajectoryAdapterService
 *
 * 职责：将 TrajectoryCollectionService 的调用适配到 ROLL Actor-Worker
 *
 * 这是一个适配器模式，允许现有代码通过 TrajectoryCollectionService 接口
 * 调用 ROLL Actor-Worker 生成轨迹，实现渐进式迁移。
 */
@Injectable()
export class RollTrajectoryAdapterService {
  private readonly logger = new Logger(RollTrajectoryAdapterService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly rollClient?: RollClientService,
  ) {
    this.enabled =
      this.configService.get<boolean>('ROLL_TRAJECTORY_ENABLED') !== false &&
      !!this.rollClient;
    
    this.logger.log(
      `[RollTrajectoryAdapter] 初始化: enabled=${this.enabled}`,
    );
  }

  /**
   * 生成轨迹（适配 TrajectoryCollectionService.collectTrajectory 接口）
   *
   * 注意：这个方法只负责生成轨迹数据，不负责数据库存储
   * 数据库存储仍然由 TrajectoryCollectionService 处理
   */
  async generateTrajectory(
    data: TrajectoryCollectionData,
  ): Promise<{
    trajectoryId: string;
    trajectory: any;
    success: boolean;
  }> {
    if (!this.enabled) {
      throw new Error('ROLL Actor-Worker 未启用');
    }

    this.logger.debug(
      `[RollTrajectoryAdapter] 生成轨迹: requestId=${data.requestId}`,
    );

    try {
      // 构建 Actor-Worker 请求
      const request = {
        requestId: data.requestId,
        userRequest: this.extractUserRequest(data),
        state: {
          tripId: data.tripId,
          plan: data.plan,
          decisionTrace: data.decisionTrace,
          researchData: data.researchData,
          gateResult: data.gateResult,
          complianceResult: data.complianceResult,
          modelVersion: data.modelVersion,
          countryCode: data.countryCode,
        },
        action: 'collect_trajectory',
        params: {
          validationStatus: 'PENDING', // 初始状态
        },
      };

      // 调用 ROLL Actor-Worker
      const result = await this.rollClient!.callActorWorker(request);

      if (!result.success || !result.trajectory) {
        throw new Error(result.error || 'Actor-Worker 调用失败');
      }

      const trajectoryId = result.trajectoryId || `traj_${data.requestId}_${Date.now()}`;

      this.logger.debug(
        `[RollTrajectoryAdapter] 轨迹生成完成: trajectoryId=${trajectoryId}`,
      );

      return {
        trajectoryId,
        trajectory: result.trajectory,
        success: true,
      };
    } catch (error: any) {
      this.logger.warn(
        `[RollTrajectoryAdapter] 轨迹生成失败: requestId=${data.requestId}, error=${error?.message}`,
      );
      throw error;
    }
  }

  /**
   * 从轨迹数据中提取用户请求
   */
  private extractUserRequest(data: TrajectoryCollectionData): string {
    // 尝试从不同来源提取用户请求
    if (data.researchData?.userRequest) {
      return data.researchData.userRequest as string;
    }
    if (data.researchData?.user_request) {
      return data.researchData.user_request as string;
    }
    if (data.researchData?.request) {
      return data.researchData.request as string;
    }
    // 从 decisionTrace 中查找用户请求
    if (Array.isArray(data.decisionTrace) && data.decisionTrace.length > 0) {
      const firstEntry = data.decisionTrace[0];
      if (firstEntry && typeof firstEntry === 'object' && 'userRequest' in firstEntry) {
        return (firstEntry as any).userRequest;
      }
      if (firstEntry && typeof firstEntry === 'object' && 'user_request' in firstEntry) {
        return (firstEntry as any).user_request;
      }
    }
    // 从 plan metadata 中查找
    if (data.plan?.metadata && typeof data.plan.metadata === 'object') {
      const metadata = data.plan.metadata as any;
      if (metadata.userRequest) {
        return metadata.userRequest;
      }
      if (metadata.user_request) {
        return metadata.user_request;
      }
    }
    return `Request ${data.requestId}`;
  }
}
