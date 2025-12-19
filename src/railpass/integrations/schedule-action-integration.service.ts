// src/railpass/integrations/schedule-action-integration.service.ts

/**
 * ScheduleAction 集成服务
 * 
 * 在 ScheduleAction 中添加订座可行性自动重验证
 * 当行程变更时，自动重新验证订座可行性
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  RailPassProfile,
  RailSegment,
  ReservationTask,
} from '../interfaces/railpass.interface';
import { ComplianceValidatorService } from '../services/compliance-validator.service';
import { ReservationOrchestrationService } from '../services/reservation-orchestration.service';
import { ReservationDecisionEngineService } from '../services/reservation-decision-engine.service';
import { RailPassConstraintsService } from '../constraints/railpass-constraints.service';

/**
 * 订座可行性重验证结果
 */
export interface ReservationRevalidationResult {
  /** 是否需要重新验证 */
  needsRevalidation: boolean;
  
  /** 验证通过 */
  valid: boolean;
  
  /** 新发现的违规 */
  newViolations: Array<{
    code: string;
    severity: 'error' | 'warning';
    message: string;
    segmentId?: string;
  }>;
  
  /** 受影响的任务 */
  affectedTasks: Array<{
    taskId: string;
    segmentId: string;
    oldStatus: string;
    newStatus: string;
    reason: string;
  }>;
  
  /** 建议的操作 */
  recommendedActions: string[];
}

@Injectable()
export class ScheduleActionIntegrationService {
  private readonly logger = new Logger(ScheduleActionIntegrationService.name);

  constructor(
    private readonly complianceValidator: ComplianceValidatorService,
    private readonly reservationOrchestrator: ReservationOrchestrationService,
    private readonly reservationEngine: ReservationDecisionEngineService,
    private readonly constraintsService: RailPassConstraintsService,
  ) {}

  /**
   * 重新验证订座可行性
   * 
   * 当行程变更时（如时间调整、段添加/删除），自动重新验证订座可行性
   */
  async revalidateReservationFeasibility(args: {
    passProfile: RailPassProfile;
    oldSegments: RailSegment[];
    newSegments: RailSegment[];
    oldReservationTasks: ReservationTask[];
  }): Promise<ReservationRevalidationResult> {
    const { passProfile, oldSegments, newSegments, oldReservationTasks } = args;

    // 1. 检测变更
    const changes = this.detectSegmentChanges(oldSegments, newSegments);
    const needsRevalidation = changes.hasChanges;

    if (!needsRevalidation) {
      return {
        needsRevalidation: false,
        valid: true,
        newViolations: [],
        affectedTasks: [],
        recommendedActions: [],
      };
    }

    // 2. 重新规划订座任务
    const newReservationPlan = this.reservationOrchestrator.planReservations({
      segments: newSegments,
    });

    // 3. 合规验证
    const complianceResult = await this.complianceValidator.validateCompliance({
      passProfile,
      segments: newSegments,
      reservationTasks: newReservationPlan.reservationTasks,
    });

    // 4. 约束检查
    const constraintViolations = this.constraintsService.checkAllConstraints({
      passProfile,
      segments: newSegments,
      reservationTasks: newReservationPlan.reservationTasks,
    });

    // 5. 识别受影响的任务
    const affectedTasks = this.identifyAffectedTasks(
      oldReservationTasks,
      newReservationPlan.reservationTasks,
      changes
    );

    // 6. 合并违规（过滤掉 info 级别的，只保留 error 和 warning）
    const allViolations = [
      ...complianceResult.violations
        .filter(v => v.severity === 'error' || v.severity === 'warning')
        .map(v => ({
          code: v.code,
          severity: v.severity as 'error' | 'warning',
          message: v.message,
          segmentId: v.segmentId,
        })),
      ...constraintViolations
        .filter(v => v.severity === 'error' || v.severity === 'warning')
        .map(v => ({
          code: v.code,
          severity: v.severity as 'error' | 'warning',
          message: v.message,
          segmentId: v.slotId,
        })),
    ];

    // 7. 生成建议
    const recommendedActions = this.generateRecommendations(
      complianceResult,
      constraintViolations,
      affectedTasks,
      changes
    );

    return {
      needsRevalidation: true,
      valid: complianceResult.valid && constraintViolations.filter(v => v.severity === 'error').length === 0,
      newViolations: allViolations,
      affectedTasks,
      recommendedActions,
    };
  }

  /**
   * 检测段变更
   */
  private detectSegmentChanges(
    oldSegments: RailSegment[],
    newSegments: RailSegment[]
  ): {
    hasChanges: boolean;
    added: RailSegment[];
    removed: RailSegment[];
    modified: Array<{ old: RailSegment; new: RailSegment }>;
  } {
    const oldMap = new Map(oldSegments.map(s => [s.segmentId, s]));
    const newMap = new Map(newSegments.map(s => [s.segmentId, s]));

    const added: RailSegment[] = [];
    const removed: RailSegment[] = [];
    const modified: Array<{ old: RailSegment; new: RailSegment }> = [];

    // 检查新增和修改
    for (const newSeg of newSegments) {
      const oldSeg = oldMap.get(newSeg.segmentId);
      if (!oldSeg) {
        added.push(newSeg);
      } else if (this.isSegmentModified(oldSeg, newSeg)) {
        modified.push({ old: oldSeg, new: newSeg });
      }
    }

    // 检查删除
    for (const oldSeg of oldSegments) {
      if (!newMap.has(oldSeg.segmentId)) {
        removed.push(oldSeg);
      }
    }

    return {
      hasChanges: added.length > 0 || removed.length > 0 || modified.length > 0,
      added,
      removed,
      modified,
    };
  }

  /**
   * 检查段是否被修改
   */
  private isSegmentModified(oldSeg: RailSegment, newSeg: RailSegment): boolean {
    // 检查关键字段是否变化
    return (
      oldSeg.departureDate !== newSeg.departureDate ||
      oldSeg.departureTimeWindow?.earliest !== newSeg.departureTimeWindow?.earliest ||
      oldSeg.fromPlaceId !== newSeg.fromPlaceId ||
      oldSeg.toPlaceId !== newSeg.toPlaceId ||
      oldSeg.isNightTrain !== newSeg.isNightTrain ||
      oldSeg.isHighSpeed !== newSeg.isHighSpeed
    );
  }

  /**
   * 识别受影响的任务
   */
  private identifyAffectedTasks(
    oldTasks: ReservationTask[],
    newTasks: ReservationTask[],
    changes: ReturnType<typeof this.detectSegmentChanges>
  ): ReservationRevalidationResult['affectedTasks'] {
    const affected: ReservationRevalidationResult['affectedTasks'] = [];

    // 删除的段对应的任务
    for (const removedSeg of changes.removed) {
      const oldTask = oldTasks.find(t => t.segmentId === removedSeg.segmentId);
      if (oldTask) {
        affected.push({
          taskId: oldTask.taskId,
          segmentId: removedSeg.segmentId,
          oldStatus: oldTask.status,
          newStatus: 'CANCELLED', // 标记为已取消
          reason: '段已从行程中移除',
        });
      }
    }

    // 修改的段对应的任务
    for (const mod of changes.modified) {
      const oldTask = oldTasks.find(t => t.segmentId === mod.old.segmentId);
      const newTask = newTasks.find(t => t.segmentId === mod.new.segmentId);

      if (oldTask && newTask && oldTask.status !== newTask.status) {
        affected.push({
          taskId: oldTask.taskId,
          segmentId: mod.old.segmentId,
          oldStatus: oldTask.status,
          newStatus: newTask.status,
          reason: '段信息已变更，需要重新评估订座需求',
        });
      }
    }

    // 新增的段对应的任务
    for (const addedSeg of changes.added) {
      const newTask = newTasks.find(t => t.segmentId === addedSeg.segmentId);
      if (newTask) {
        affected.push({
          taskId: newTask.taskId,
          segmentId: addedSeg.segmentId,
          oldStatus: 'N/A',
          newStatus: newTask.status,
          reason: '新增段，需要订座',
        });
      }
    }

    return affected;
  }

  /**
   * 生成建议操作
   */
  private generateRecommendations(
    complianceResult: any,
    constraintViolations: any[],
    affectedTasks: ReservationRevalidationResult['affectedTasks'],
    changes: ReturnType<typeof this.detectSegmentChanges>
  ): string[] {
    const recommendations: string[] = [];

    // 如果有新增的段且需要订座
    if (changes.added.length > 0) {
      const needReservationCount = affectedTasks.filter(
        t => t.newStatus === 'NEEDED' || t.newStatus === 'PLANNED'
      ).length;
      if (needReservationCount > 0) {
        recommendations.push(`新增了 ${needReservationCount} 个需要订座的段，建议尽快订座`);
      }
    }

    // 如果有必须订座但未订的违规
    const mandatoryViolations = constraintViolations.filter(
      v => v.code === 'RAILPASS_RESERVATION_MANDATORY'
    );
    if (mandatoryViolations.length > 0) {
      recommendations.push(`有 ${mandatoryViolations.length} 个段必须订座但尚未订座，建议立即订座或选择替代路线`);
    }

    // 如果有 Travel Day 超限
    const travelDayViolations = constraintViolations.filter(
      v => v.code === 'RAILPASS_TRAVEL_DAY_BUDGET_EXCEEDED'
    );
    if (travelDayViolations.length > 0) {
      recommendations.push('Travel Days 已超限，建议减少 rail segments 或升级 Pass');
    }

    // 如果有修改的段
    if (changes.modified.length > 0) {
      recommendations.push(`${changes.modified.length} 个段已修改，请确认原有订座是否仍然有效`);
    }

    return recommendations;
  }
}
