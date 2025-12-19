// src/railpass/actions/railpass-actions.service.ts

/**
 * RailPass Actions Service
 * 
 * 为 Decision 层提供 RailPass 相关的动作（Actions）
 * 这些动作可以被 Neptune 策略调用，用于最小改动修复
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  RailSegment,
  ReservationTask,
  FallbackOption,
} from '../interfaces/railpass.interface';
import { ReservationDecisionEngineService } from '../services/reservation-decision-engine.service';
import { ReservationOrchestrationService } from '../services/reservation-orchestration.service';

/**
 * RailPass Action 类型
 */
export type RailPassActionType =
  | 'BOOK_RESERVATION'                    // 订座
  | 'SWITCH_TO_NO_RESERVATION_ROUTE'      // 改乘不需订座的慢车
  | 'SHIFT_DEPARTURE_TIME'                // 调整出发时间
  | 'MOVE_SEGMENT_TO_OTHER_DAY'           // 将段移到其他天
  | 'REPLACE_RAIL_WITH_FLIGHT_OR_BUS'     // 替换为飞机/巴士
  | 'SPLIT_NIGHT_TRAIN'                   // 拆分夜车（改为日间车+住宿）
  | 'MERGE_SEGMENTS_SAME_DAY';            // 合并同一天的段（节省 Travel Day）

/**
 * RailPass Action 结果
 */
export interface RailPassActionResult {
  actionType: RailPassActionType;
  success: boolean;
  segmentId: string;
  newSegment?: RailSegment;
  reservationTask?: ReservationTask;
  fallbackOption?: FallbackOption;
  explanation: string;
  impact?: {
    timeDeltaMinutes?: number;
    costDeltaEur?: number;
    travelDaysDelta?: number;
  };
}

@Injectable()
export class RailPassActionsService {
  private readonly logger = new Logger(RailPassActionsService.name);

  constructor(
    private readonly reservationEngine: ReservationDecisionEngineService,
    private readonly reservationOrchestrator: ReservationOrchestrationService,
  ) {}

  /**
   * BOOK_RESERVATION: 订座
   */
  async bookReservation(
    segment: RailSegment,
    task: ReservationTask
  ): Promise<RailPassActionResult> {
    try {
      // 更新任务状态为 BOOKED
      const updatedTask = this.reservationOrchestrator.updateTaskStatus(
        task.taskId,
        'BOOKED',
        {
          bookingRef: `BOOKING_${Date.now()}`, // 实际应该从订座 API 获取
          cost: this.estimateReservationCost(segment),
        }
      );

      return {
        actionType: 'BOOK_RESERVATION',
        success: true,
        segmentId: segment.segmentId,
        reservationTask: updatedTask,
        explanation: `已为段 ${segment.segmentId} 订座`,
        impact: {
          costDeltaEur: updatedTask.cost,
        },
      };
    } catch (error: any) {
      this.logger.error(`Failed to book reservation for segment ${segment.segmentId}:`, error);
      return {
        actionType: 'BOOK_RESERVATION',
        success: false,
        segmentId: segment.segmentId,
        explanation: `订座失败: ${error.message}`,
      };
    }
  }

  /**
   * SWITCH_TO_NO_RESERVATION_ROUTE: 改乘不需订座的慢车
   */
  async switchToNoReservationRoute(
    segment: RailSegment
  ): Promise<RailPassActionResult> {
    const fallbackOptions = this.reservationEngine.generateFallbackOptions(segment);
    const slowTrainOption = fallbackOptions.find(
      opt => opt.type === 'SWITCH_TO_SLOW_TRAIN'
    );

    if (!slowTrainOption) {
      return {
        actionType: 'SWITCH_TO_NO_RESERVATION_ROUTE',
        success: false,
        segmentId: segment.segmentId,
        explanation: '未找到不需要订座的慢车替代方案',
      };
    }

    const newSegment: RailSegment = {
      ...segment,
      segmentId: `${segment.segmentId}_slow`,
      isHighSpeed: false,
      isNightTrain: false,
      t_api: (segment.t_api || 0) + (slowTrainOption.timeDeltaMinutes || 60),
      t_robust: (segment.t_robust || 0) + (slowTrainOption.timeDeltaMinutes || 60),
    };

    return {
      actionType: 'SWITCH_TO_NO_RESERVATION_ROUTE',
      success: true,
      segmentId: segment.segmentId,
      newSegment,
      fallbackOption: slowTrainOption,
      explanation: `已改为不需订座的慢车路线`,
      impact: {
        timeDeltaMinutes: slowTrainOption.timeDeltaMinutes,
        costDeltaEur: slowTrainOption.costDeltaEur,
      },
    };
  }

  /**
   * SHIFT_DEPARTURE_TIME: 调整出发时间（避开高峰）
   */
  async shiftDepartureTime(
    segment: RailSegment,
    deltaHours: number = 2
  ): Promise<RailPassActionResult> {
    if (!segment.departureTimeWindow) {
      return {
        actionType: 'SHIFT_DEPARTURE_TIME',
        success: false,
        segmentId: segment.segmentId,
        explanation: '段没有出发时间窗，无法调整',
      };
    }

    const deltaMs = deltaHours * 60 * 60 * 1000;
    const newSegment: RailSegment = {
      ...segment,
      segmentId: `${segment.segmentId}_shifted`,
      departureTimeWindow: {
        earliest: this.shiftTime(segment.departureTimeWindow.earliest, deltaMs),
        latest: this.shiftTime(segment.departureTimeWindow.latest, deltaMs),
      },
    };

    return {
      actionType: 'SHIFT_DEPARTURE_TIME',
      success: true,
      segmentId: segment.segmentId,
      newSegment,
      explanation: `已将出发时间调整 ${deltaHours > 0 ? '延后' : '提前'} ${Math.abs(deltaHours)} 小时`,
      impact: {
        timeDeltaMinutes: 0, // 时间变化不影响总时长
      },
    };
  }

  /**
   * MOVE_SEGMENT_TO_OTHER_DAY: 将段移到其他天
   */
  async moveSegmentToOtherDay(
    segment: RailSegment,
    newDate: string
  ): Promise<RailPassActionResult> {
    const newSegment: RailSegment = {
      ...segment,
      segmentId: `${segment.segmentId}_moved`,
      departureDate: newDate,
    };

    return {
      actionType: 'MOVE_SEGMENT_TO_OTHER_DAY',
      success: true,
      segmentId: segment.segmentId,
      newSegment,
      explanation: `已将段从 ${segment.departureDate} 移到 ${newDate}`,
    };
  }

  /**
   * REPLACE_RAIL_WITH_FLIGHT_OR_BUS: 替换为飞机/巴士
   */
  async replaceRailWithAlternative(
    segment: RailSegment,
    alternative: 'FLIGHT' | 'BUS'
  ): Promise<RailPassActionResult> {
    const fallbackOptions = this.reservationEngine.generateFallbackOptions(segment);
    const optionType = alternative === 'FLIGHT' 
      ? 'REPLACE_WITH_FLIGHT' 
      : 'REPLACE_WITH_BUS';
    
    const option = fallbackOptions.find(opt => opt.type === optionType);

    if (!option) {
      return {
        actionType: 'REPLACE_RAIL_WITH_FLIGHT_OR_BUS',
        success: false,
        segmentId: segment.segmentId,
        explanation: `未找到${alternative === 'FLIGHT' ? '飞机' : '巴士'}替代方案`,
      };
    }

    // 注意：这里返回的 segment 需要标记为其他交通方式
    // 实际实现中可能需要移除该 segment 或标记为已替换
    const newSegment: RailSegment = {
      ...segment,
      segmentId: `${segment.segmentId}_${alternative.toLowerCase()}`,
      // 标记为已替换（实际可能需要不同的数据结构）
    };

    return {
      actionType: 'REPLACE_RAIL_WITH_FLIGHT_OR_BUS',
      success: true,
      segmentId: segment.segmentId,
      newSegment,
      fallbackOption: option,
      explanation: `已将铁路段替换为${alternative === 'FLIGHT' ? '飞机' : '巴士'}`,
      impact: {
        timeDeltaMinutes: option.timeDeltaMinutes,
        costDeltaEur: option.costDeltaEur,
      },
    };
  }

  /**
   * SPLIT_NIGHT_TRAIN: 拆分夜车（改为日间车+住宿）
   */
  async splitNightTrain(
    segment: RailSegment
  ): Promise<RailPassActionResult> {
    if (!segment.isNightTrain) {
      return {
        actionType: 'SPLIT_NIGHT_TRAIN',
        success: false,
        segmentId: segment.segmentId,
        explanation: '段不是夜车，无法拆分',
      };
    }

    const fallbackOptions = this.reservationEngine.generateFallbackOptions(segment);
    const splitOption = fallbackOptions.find(opt => opt.type === 'SPLIT_SEGMENT');

    if (!splitOption) {
      return {
        actionType: 'SPLIT_NIGHT_TRAIN',
        success: false,
        segmentId: segment.segmentId,
        explanation: '未找到拆分方案',
      };
    }

    // 创建日间替代段
    const daySegment: RailSegment = {
      ...segment,
      segmentId: `${segment.segmentId}_day`,
      isNightTrain: false,
      crossesMidnight: false,
    };

    return {
      actionType: 'SPLIT_NIGHT_TRAIN',
      success: true,
      segmentId: segment.segmentId,
      newSegment: daySegment,
      fallbackOption: splitOption,
      explanation: '已将夜车拆分为日间车（需要额外住宿）',
      impact: {
        travelDaysDelta: -1, // 从 2 天变为 1 天（如果跨午夜）
        costDeltaEur: splitOption.costDeltaEur, // 增加住宿费用
      },
    };
  }

  /**
   * MERGE_SEGMENTS_SAME_DAY: 合并同一天的段（节省 Travel Day）
   */
  async mergeSegmentsSameDay(
    segments: RailSegment[]
  ): Promise<RailPassActionResult[]> {
    // 这个动作比较复杂，需要重新规划同一天的多个段
    // 简化实现：返回建议
    return segments.map(seg => ({
      actionType: 'MERGE_SEGMENTS_SAME_DAY' as const,
      success: true,
      segmentId: seg.segmentId,
      explanation: '建议将这些段合并到同一天以节省 Travel Day',
      impact: {
        travelDaysDelta: -1, // 假设可以节省 1 天
      },
    }));
  }

  /**
   * 估算订座费用
   */
  private estimateReservationCost(segment: RailSegment): number {
    const requirement = this.reservationEngine.checkReservation(segment);
    return requirement.feeEstimate?.max || requirement.feeEstimate?.min || 0;
  }

  /**
   * 时间偏移（毫秒）
   */
  private shiftTime(timeStr: string, deltaMs: number): string {
    const time = new Date(timeStr);
    time.setTime(time.getTime() + deltaMs);
    return time.toISOString();
  }

  /**
   * 根据违规类型选择合适的动作
   */
  suggestActionsForViolation(
    violationCode: string,
    segment: RailSegment
  ): RailPassActionType[] {
    const actions: RailPassActionType[] = [];

    switch (violationCode) {
      case 'RAILPASS_RESERVATION_MANDATORY':
        // 必须订座但未订
        actions.push('BOOK_RESERVATION');
        actions.push('SWITCH_TO_NO_RESERVATION_ROUTE');
        actions.push('SHIFT_DEPARTURE_TIME');
        break;

      case 'RAILPASS_TRAVEL_DAY_BUDGET_EXCEEDED':
        // Travel Day 超限
        if (segment.isNightTrain && segment.crossesMidnight) {
          actions.push('SPLIT_NIGHT_TRAIN');
        }
        actions.push('MOVE_SEGMENT_TO_OTHER_DAY');
        actions.push('MERGE_SEGMENTS_SAME_DAY');
        break;

      case 'RAILPASS_HOME_COUNTRY_OUTBOUND_EXCEEDED':
      case 'RAILPASS_HOME_COUNTRY_INBOUND_EXCEEDED':
        // 居住国使用超限
        actions.push('REPLACE_RAIL_WITH_FLIGHT_OR_BUS');
        actions.push('MOVE_SEGMENT_TO_OTHER_DAY');
        break;

      case 'RESERVATION_QUOTA_HIGH':
        // 订座配额紧张
        actions.push('BOOK_RESERVATION'); // 立即订座
        actions.push('SHIFT_DEPARTURE_TIME'); // 或换时段
        actions.push('SWITCH_TO_NO_RESERVATION_ROUTE'); // 或改慢车
        break;

      default:
        // 默认建议
        actions.push('BOOK_RESERVATION');
        actions.push('SHIFT_DEPARTURE_TIME');
    }

    return actions;
  }
}
