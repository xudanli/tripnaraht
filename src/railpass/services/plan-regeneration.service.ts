// src/railpass/services/plan-regeneration.service.ts

/**
 * 改方案服务
 * 
 * 根据策略重新生成 rail segments，应用相应的约束和目标
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  RailPassProfile,
  RailSegment,
  ReservationTask,
  FallbackOption,
} from '../interfaces/railpass.interface';
import { RegeneratePlanRequest } from '../interfaces/executability-check.interface';
import { ReservationDecisionEngineService } from './reservation-decision-engine.service';
import { ReservationOrchestrationService } from './reservation-orchestration.service';
import { TravelDayCalculationEngineService } from './travel-day-calculation-engine.service';

interface RegeneratePlanInput {
  passProfile: RailPassProfile;
  segments: RailSegment[];
  reservationTasks: ReservationTask[];
  strategy: 'MORE_STABLE' | 'MORE_ECONOMICAL' | 'MORE_AFFORDABLE' | 'CUSTOM';
  customParams?: {
    avoidMandatoryReservations?: boolean;
    minimizeTravelDays?: boolean;
    maxReservationFee?: number;
  };
}

export interface RegeneratePlanResult {
  segments: RailSegment[];
  reservationTasks: ReservationTask[];
  changes: Array<{
    segmentId: string;
    changeType: 'REMOVED' | 'REPLACED' | 'SHIFTED_TIME' | 'REPLACED_WITH_ALTERNATIVE';
    oldSegment?: RailSegment;
    newSegment?: RailSegment;
    reason: string;
  }>;
  metrics: {
    totalSegmentsBefore: number;
    totalSegmentsAfter: number;
    reservationTasksBefore: number;
    reservationTasksAfter: number;
    mandatoryReservationsRemoved?: number;
    travelDaysSaved?: number;
    costChangeEur?: number;
  };
  explanation: string;
}

@Injectable()
export class PlanRegenerationService {
  private readonly logger = new Logger(PlanRegenerationService.name);

  constructor(
    private readonly reservationEngine: ReservationDecisionEngineService,
    private readonly reservationOrchestrator: ReservationOrchestrationService,
    private readonly travelDayCalculator: TravelDayCalculationEngineService,
  ) {}

  /**
   * 重新生成方案
   */
  async regeneratePlan(input: RegeneratePlanInput): Promise<RegeneratePlanResult> {
    const { passProfile, segments, reservationTasks, strategy, customParams } = input;

    switch (strategy) {
      case 'MORE_STABLE':
        return this.regenerateForStability(passProfile, segments, reservationTasks);
      
      case 'MORE_ECONOMICAL':
        return this.regenerateForEconomy(passProfile, segments, reservationTasks);
      
      case 'MORE_AFFORDABLE':
        return this.regenerateForAffordability(passProfile, segments, reservationTasks);
      
      case 'CUSTOM':
        return this.regenerateCustom(passProfile, segments, reservationTasks, customParams);
      
      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  /**
   * 更稳：避开必须订座的车
   */
  private async regenerateForStability(
    passProfile: RailPassProfile,
    segments: RailSegment[],
    reservationTasks: ReservationTask[]
  ): Promise<RegeneratePlanResult> {
    const changes: RegeneratePlanResult['changes'] = [];
    const newSegments: RailSegment[] = [];
    let mandatoryReservationsRemoved = 0;

    for (const segment of segments) {
      const requirement = this.reservationEngine.checkReservation(segment);
      const task = reservationTasks.find(t => t.segmentId === segment.segmentId);

      // 如果必须订座且配额风险高，尝试找替代方案
      if (requirement.required && requirement.quotaRisk === 'HIGH') {
        const fallbackOptions = this.reservationEngine.generateFallbackOptions(segment);
        
        // 优先选择：改乘不需订座的慢车
        const slowTrainOption = fallbackOptions.find(
          opt => opt.type === 'SWITCH_TO_SLOW_TRAIN'
        );

        if (slowTrainOption) {
          // 创建新的 segment（慢车版本）
          const newSegment: RailSegment = {
            ...segment,
            segmentId: `${segment.segmentId}_slow`,
            isHighSpeed: false,
            isNightTrain: false,
            // 更新时间（慢车通常更慢）
            t_api: (segment.t_api || 0) + (slowTrainOption.timeDeltaMinutes || 60),
            t_robust: (segment.t_robust || 0) + (slowTrainOption.timeDeltaMinutes || 60),
          };

          changes.push({
            segmentId: segment.segmentId,
            changeType: 'REPLACED',
            oldSegment: segment,
            newSegment,
            reason: '避开必须订座的高风险段，改为不需订座的慢车',
          });

          newSegments.push(newSegment);
          mandatoryReservationsRemoved++;
          continue;
        }

        // 如果没有慢车选项，尝试换时段
        const shiftTimeOption = fallbackOptions.find(
          opt => opt.type === 'SHIFT_TIME'
        );

        if (shiftTimeOption) {
          // 调整出发时间窗（简化：提前或延后 2 小时）
          const oldWindow = segment.departureTimeWindow;
          if (oldWindow) {
            const newSegment: RailSegment = {
              ...segment,
              segmentId: `${segment.segmentId}_shifted`,
              departureTimeWindow: {
                earliest: this.shiftTime(oldWindow.earliest, 2 * 60 * 60 * 1000), // +2 hours
                latest: this.shiftTime(oldWindow.latest, 2 * 60 * 60 * 1000),
              },
            };

            changes.push({
              segmentId: segment.segmentId,
              changeType: 'SHIFTED_TIME',
              oldSegment: segment,
              newSegment,
              reason: '调整出发时间避开高峰时段',
            });

            newSegments.push(newSegment);
            continue;
          }
        }
      }

      // 不需要改动，保留原 segment
      newSegments.push(segment);
    }

    // 重新规划订座任务
    const newReservationPlan = this.reservationOrchestrator.planReservations({
      segments: newSegments,
    });

    return {
      segments: newSegments,
      reservationTasks: newReservationPlan.reservationTasks,
      changes,
      metrics: {
        totalSegmentsBefore: segments.length,
        totalSegmentsAfter: newSegments.length,
        reservationTasksBefore: reservationTasks.length,
        reservationTasksAfter: newReservationPlan.reservationTasks.length,
        mandatoryReservationsRemoved,
      },
      explanation: `已避开 ${mandatoryReservationsRemoved} 个必须订座的高风险段，改为不需订座的替代方案`,
    };
  }

  /**
   * 更省：减少 Travel Day 消耗（仅 Flexi Pass）
   */
  private async regenerateForEconomy(
    passProfile: RailPassProfile,
    segments: RailSegment[],
    reservationTasks: ReservationTask[]
  ): Promise<RegeneratePlanResult> {
    if (passProfile.validityType !== 'FLEXI') {
      return {
        segments,
        reservationTasks,
        changes: [],
        metrics: {
          totalSegmentsBefore: segments.length,
          totalSegmentsAfter: segments.length,
          reservationTasksBefore: reservationTasks.length,
          reservationTasksAfter: reservationTasks.length,
        },
        explanation: 'Continuous Pass 不涉及 Travel Day 消耗，无需优化',
      };
    }

    const changes: RegeneratePlanResult['changes'] = [];
    const newSegments: RailSegment[] = [];
    let travelDaysSaved = 0;

    // 计算当前 Travel Day 消耗
    const currentTravelDayResult = this.travelDayCalculator.calculateTravelDays({
      segments,
      passProfile,
    });

    // 按日期分组 segments
    const segmentsByDate = new Map<string, RailSegment[]>();
    for (const seg of segments) {
      const date = seg.departureDate;
      if (!segmentsByDate.has(date)) {
        segmentsByDate.set(date, []);
      }
      segmentsByDate.get(date)!.push(seg);
    }

    // 优化策略：合并同一天的行程，避免跨午夜
    for (const [date, segs] of segmentsByDate.entries()) {
      // 检查是否有跨午夜的夜车
      const nightTrains = segs.filter(s => s.isNightTrain && s.crossesMidnight);

      for (const nightTrain of nightTrains) {
        // 尝试替换为白天车 + 住宿，或拆段
        const fallbackOptions = this.reservationEngine.generateFallbackOptions(nightTrain);
        const splitOption = fallbackOptions.find(opt => opt.type === 'SPLIT_SEGMENT');

        if (splitOption) {
          // 将夜车拆成日间车（简化：移除夜车，添加日间替代）
          changes.push({
            segmentId: nightTrain.segmentId,
            changeType: 'REPLACED_WITH_ALTERNATIVE',
            oldSegment: nightTrain,
            reason: '将跨午夜夜车改为日间车，节省 Travel Day',
          });

          // 创建日间替代 segment（简化处理）
          const daySegment: RailSegment = {
            ...nightTrain,
            segmentId: `${nightTrain.segmentId}_day`,
            isNightTrain: false,
            crossesMidnight: false,
          };

          newSegments.push(daySegment);
          travelDaysSaved++; // 从 2 天变为 1 天
          continue;
        }
      }

      // 保留其他 segments
      for (const seg of segs) {
        if (!nightTrains.includes(seg)) {
          newSegments.push(seg);
        }
      }
    }

    // 计算新的 Travel Day 消耗
    const newTravelDayResult = this.travelDayCalculator.calculateTravelDays({
      segments: newSegments,
      passProfile,
    });

    const actualTravelDaysSaved = currentTravelDayResult.totalDaysUsed - newTravelDayResult.totalDaysUsed;

    // 重新规划订座任务
    const newReservationPlan = this.reservationOrchestrator.planReservations({
      segments: newSegments,
    });

    return {
      segments: newSegments,
      reservationTasks: newReservationPlan.reservationTasks,
      changes,
      metrics: {
        totalSegmentsBefore: segments.length,
        totalSegmentsAfter: newSegments.length,
        reservationTasksBefore: reservationTasks.length,
        reservationTasksAfter: newReservationPlan.reservationTasks.length,
        travelDaysSaved: actualTravelDaysSaved,
      },
      explanation: `已优化行程，节省 ${actualTravelDaysSaved} 个 Travel Day（${currentTravelDayResult.totalDaysUsed} → ${newTravelDayResult.totalDaysUsed}）`,
    };
  }

  /**
   * 更便宜：对比直购票 vs 通票+订座（P2，简化实现）
   */
  private async regenerateForAffordability(
    passProfile: RailPassProfile,
    segments: RailSegment[],
    reservationTasks: ReservationTask[]
  ): Promise<RegeneratePlanResult> {
    // P2 功能，这里简化实现
    // 实际需要：查询直购票价格，对比 Pass 价格 + 订座费用
    
    const changes: RegeneratePlanResult['changes'] = [];
    const newSegments: RailSegment[] = [];
    let costChange = 0;

    // 计算当前总费用（Pass 价格 + 订座费用）
    const totalReservationFee = reservationTasks.reduce((sum, task) => {
      return sum + (task.cost || 0);
    }, 0);

    // 简化：对于短途/非热门线路，建议直购票可能更便宜
    for (const segment of segments) {
      const requirement = this.reservationEngine.checkReservation(segment);
      const task = reservationTasks.find(t => t.segmentId === segment.segmentId);

      // 如果订座费用较高（> 20 EUR）且距离较短，建议直购票
      if (requirement.feeEstimate && requirement.feeEstimate.max > 20) {
        // 估算直购票价格（简化：基于距离估算）
        const estimatedDirectTicketPrice = this.estimateDirectTicketPrice(segment);

        if (estimatedDirectTicketPrice < requirement.feeEstimate.max) {
          changes.push({
            segmentId: segment.segmentId,
            changeType: 'REPLACED',
            oldSegment: segment,
            reason: `直购票（约 ${estimatedDirectTicketPrice} EUR）比 Pass+订座（${requirement.feeEstimate.max} EUR）更便宜，建议单独买票`,
          });

          // 移除该 segment（改用直购票，不在 Pass 规划内）
          costChange -= requirement.feeEstimate.max;
          costChange += estimatedDirectTicketPrice;
          continue;
        }
      }

      newSegments.push(segment);
    }

      // 重新规划订座任务
      const newReservationPlan = this.reservationOrchestrator.planReservations({
        segments: newSegments,
      });

    return {
      segments: newSegments,
      reservationTasks: newReservationPlan.reservationTasks,
      changes,
      metrics: {
        totalSegmentsBefore: segments.length,
        totalSegmentsAfter: newSegments.length,
        reservationTasksBefore: reservationTasks.length,
        reservationTasksAfter: newReservationPlan.reservationTasks.length,
        costChangeEur: costChange,
      },
      explanation: costChange < 0
        ? `建议部分段使用直购票，预计节省 ${Math.abs(costChange).toFixed(2)} EUR`
        : '对比完成，Pass+订座更经济',
    };
  }

  /**
   * 自定义策略
   */
  private async regenerateCustom(
    passProfile: RailPassProfile,
    segments: RailSegment[],
    reservationTasks: ReservationTask[],
    customParams?: RegeneratePlanInput['customParams']
  ): Promise<RegeneratePlanResult> {
    // 组合多个策略
    if (customParams?.avoidMandatoryReservations) {
      const stableResult = await this.regenerateForStability(passProfile, segments, reservationTasks);
      segments = stableResult.segments;
      reservationTasks = stableResult.reservationTasks;
    }

    if (customParams?.minimizeTravelDays && passProfile.validityType === 'FLEXI') {
      const economyResult = await this.regenerateForEconomy(passProfile, segments, reservationTasks);
      segments = economyResult.segments;
      reservationTasks = economyResult.reservationTasks;
    }

    // 过滤超出预算的订座
    if (customParams?.maxReservationFee) {
      const filteredSegments = segments.filter(seg => {
        const requirement = this.reservationEngine.checkReservation(seg);
        return !requirement.feeEstimate || requirement.feeEstimate.max <= customParams.maxReservationFee!;
      });

      if (filteredSegments.length < segments.length) {
        segments = filteredSegments;
        const newPlan = this.reservationOrchestrator.planReservations({ segments });
        reservationTasks = newPlan.reservationTasks;
      }
    }

    return {
      segments,
      reservationTasks,
      changes: [],
      metrics: {
        totalSegmentsBefore: segments.length,
        totalSegmentsAfter: segments.length,
        reservationTasksBefore: reservationTasks.length,
        reservationTasksAfter: reservationTasks.length,
      },
      explanation: '已应用自定义策略',
    };
  }

  /**
   * 估算直购票价格（简化实现）
   */
  private estimateDirectTicketPrice(segment: RailSegment): number {
    // 简化：基于距离和路线类型估算
    // 实际应该调用价格查询 API
    
    let basePrice = 30; // 基础价格

    if (segment.isHighSpeed) {
      basePrice *= 1.5;
    }

    if (segment.isInternational) {
      basePrice *= 1.3;
    }

    if (segment.isNightTrain) {
      basePrice *= 1.8;
    }

    return Math.round(basePrice);
  }

  /**
   * 时间偏移（毫秒）
   */
  private shiftTime(timeStr: string, deltaMs: number): string {
    const time = new Date(timeStr);
    time.setTime(time.getTime() + deltaMs);
    return time.toISOString();
  }
}
