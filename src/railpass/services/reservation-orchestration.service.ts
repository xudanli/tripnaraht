// src/railpass/services/reservation-orchestration.service.ts

/**
 * 订座任务编排 (Reservation Task Orchestration)
 * 
 * 将订座变成系统里可追踪的"任务"，管理状态流转
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  RailSegment,
  ReservationTask,
  ReservationTaskStatus,
  ReservationPlanResult,
  ReservationRequirement,
  FallbackOption,
} from '../interfaces/railpass.interface';
import { ReservationDecisionEngineService } from './reservation-decision-engine.service';

interface PlanReservationsInput {
  segments: RailSegment[];
  userPreferences?: {
    maxReservationFee?: number; // 最大订座费用预算（EUR）
    preferNoReservation?: boolean; // 是否偏好不需订座的路线
  };
}

@Injectable()
export class ReservationOrchestrationService {
  private readonly logger = new Logger(ReservationOrchestrationService.name);

  constructor(
    private readonly reservationEngine: ReservationDecisionEngineService,
  ) {}

  /**
   * 规划订座任务
   * 
   * 为所有 segments 生成订座任务列表，评估违规，提供备用方案
   */
  planReservations(input: PlanReservationsInput): ReservationPlanResult {
    const { segments, userPreferences } = input;

    const reservationTasks: ReservationTask[] = [];
    const violations: ReservationPlanResult['violations'] = [];
    const allFallbackOptions: FallbackOption[] = [];

    let totalFeeMin = 0;
    let totalFeeMax = 0;
    let maxRisk: ReservationPlanResult['overallRisk'] = 'LOW';

    // 为每个 segment 检查订座需求并创建任务
    for (const segment of segments) {
      const requirement = this.reservationEngine.checkReservation(segment);

      // 生成任务
      const task: ReservationTask = {
        taskId: `task_${segment.segmentId}_${Date.now()}`,
        segmentId: segment.segmentId,
        status: requirement.required ? 'NEEDED' : 'PLANNED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        travelDay: segment.departureDate,
      };

      reservationTasks.push(task);

      // 如果必须订座
      if (requirement.required) {
        // 检查预算限制
        if (userPreferences?.maxReservationFee) {
          const segmentFeeMax = requirement.feeEstimate?.max || 0;
          if (segmentFeeMax > userPreferences.maxReservationFee) {
            violations.push({
              code: 'RESERVATION_FEE_OVER_BUDGET',
              severity: 'warning',
              message: `Segment ${segment.segmentId} 订座费用预估超过预算`,
              segmentId: segment.segmentId,
              details: {
                estimatedMax: segmentFeeMax,
                budget: userPreferences.maxReservationFee,
              },
            });
          }
        }

        // 累积费用
        if (requirement.feeEstimate) {
          totalFeeMin += requirement.feeEstimate.min;
          totalFeeMax += requirement.feeEstimate.max;
        }

        // 更新最大风险
        if (requirement.quotaRisk === 'HIGH') {
          maxRisk = 'HIGH';
        } else if (requirement.quotaRisk === 'MEDIUM' && maxRisk !== 'HIGH') {
          maxRisk = 'MEDIUM';
        }

        // 生成备用方案
        const fallbackOptions = this.reservationEngine.generateFallbackOptions(segment);
        allFallbackOptions.push(...fallbackOptions);
      }
    }

    // 检查是否有必须订座但不可订的情况（这里简化处理，实际需要查询运营商API）
    // 可以添加更多检查逻辑

    return {
      reservationTasks,
      violations,
      fallbackOptions: allFallbackOptions,
      totalFeeEstimate: totalFeeMax > 0 ? {
        min: totalFeeMin,
        max: totalFeeMax,
        currency: 'EUR',
      } : undefined,
      overallRisk: maxRisk,
    };
  }

  /**
   * 更新任务状态
   */
  updateTaskStatus(
    taskId: string,
    status: ReservationTaskStatus,
    updates?: {
      bookingRef?: string;
      cost?: number;
      failReason?: string;
      fallbackPlanId?: string;
    }
  ): ReservationTask {
    // 这里应该从数据库读取任务，更新状态，然后保存
    // 简化实现：返回更新后的任务对象
    return {
      taskId,
      segmentId: '', // 应从数据库读取
      status,
      bookingRef: updates?.bookingRef,
      cost: updates?.cost,
      failReason: updates?.failReason,
      fallbackPlanId: updates?.fallbackPlanId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * 获取任务列表（按状态过滤）
   */
  getTasksByStatus(
    tasks: ReservationTask[],
    status?: ReservationTaskStatus
  ): ReservationTask[] {
    if (!status) {
      return tasks;
    }
    return tasks.filter(task => task.status === status);
  }

  /**
   * 获取需要处理的任务（NEEDED 或 PLANNED）
   */
  getPendingTasks(tasks: ReservationTask[]): ReservationTask[] {
    return tasks.filter(
      task => task.status === 'NEEDED' || task.status === 'PLANNED'
    );
  }

  /**
   * 应用备用方案
   */
  applyFallback(
    taskId: string,
    fallbackOption: FallbackOption
  ): {
    success: boolean;
    newTask?: ReservationTask;
    message: string;
  } {
    // 更新任务状态为 FALLBACK_APPLIED
    const updatedTask = this.updateTaskStatus(taskId, 'FALLBACK_APPLIED', {
      fallbackPlanId: fallbackOption.optionId,
    });

    return {
      success: true,
      newTask: updatedTask,
      message: `已应用备用方案：${fallbackOption.description}`,
    };
  }
}
