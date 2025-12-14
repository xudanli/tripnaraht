// src/planning-policy/services/feasibility.service.ts

import { Injectable } from '@nestjs/common';
import { PlanningPolicy } from '../interfaces/planning-policy.interface';
import { Poi } from '../interfaces/poi.interface';
import { TransitSegment } from '../interfaces/transit-segment.interface';
import { ReplanEvent } from '../interfaces/replanner.interface';
import {
  isOpenAt,
  latestEntryMin,
  calculateDistance,
  isHoliday,
  DayOfWeek,
} from '../utils/time-utils';

/**
 * POI 可行性结果
 */
export interface PoiFeasibility {
  /** 是否可行 */
  feasible: boolean;
  /** 原因（如果不可行） */
  reason?: string;
  /** 需要等待的分钟数（如果可行但未开门） */
  waitMin?: number;
  /** 是否在开放时间内 */
  inOpenWindow: boolean;
  /** 是否超过最晚入场 */
  pastLastEntry: boolean;
  /** 是否在闭馆日期 */
  isClosedDate: boolean;
}

/**
 * 交通段可行性结果
 */
export interface TransitFeasibility {
  /** 是否可行 */
  feasible: boolean;
  /** 原因（如果不可行） */
  reason?: string;
  /** 是否违反硬约束 */
  violatesHardConstraints: boolean;
}

/**
 * 等待时间估算结果
 */
export interface WaitEstimate {
  /** 预计等待时间（分钟） */
  waitMin: number;
  /** 等待原因 */
  reason: string;
  /** 下一段开放时间（分钟数，从当天 0:00 开始） */
  nextOpenMin?: number;
}

/**
 * 统一可行性判定服务
 * 
 * 核心功能：将可行性判定从 scheduler/重排里抽出来，让排序阶段也能用
 */
@Injectable()
export class FeasibilityService {
  /**
   * 检查 POI 是否可行
   * 
   * 检查项：
   * - 硬约束（轮椅、楼梯）
   * - 时间窗（开放时间、闭馆日期）
   * - 最晚入场
   */
  isPoiFeasible(
    poi: Poi,
    atTimeMin: number,
    policy: PlanningPolicy,
    dayOfWeek: DayOfWeek,
    dateISO?: string
  ): PoiFeasibility {
    const c = policy.constraints;

    // 1. 硬约束检查
    if (c.requireWheelchairAccess && poi.wheelchairAccess === false) {
      return {
        feasible: false,
        reason: 'POI_NOT_WHEELCHAIR_ACCESSIBLE',
        inOpenWindow: false,
        pastLastEntry: false,
        isClosedDate: false,
      };
    }

    if (c.forbidStairs && poi.stairsRequired === true) {
      return {
        feasible: false,
        reason: 'POI_STAIRS_REQUIRED',
        inOpenWindow: false,
        pastLastEntry: false,
        isClosedDate: false,
      };
    }

    // 2. 时间窗检查
    if (!poi.openingHours) {
      // 没有开放时间数据，假设可行
      return {
        feasible: true,
        inOpenWindow: true,
        pastLastEntry: false,
        isClosedDate: false,
      };
    }

    const oh = poi.openingHours;

    // 检查闭馆日期
    if (dateISO && oh.closedDates?.includes(dateISO)) {
      return {
        feasible: false,
        reason: 'CLOSED_DATE',
        inOpenWindow: false,
        pastLastEntry: false,
        isClosedDate: true,
      };
    }

    // 检查是否在开放时间内
    const inOpenWindow = isOpenAt(oh, dayOfWeek, atTimeMin, dateISO);

    // 检查最晚入场
    const lastEntry = latestEntryMin(oh, dayOfWeek);
    const pastLastEntry = lastEntry !== undefined && atTimeMin > lastEntry;

    if (!inOpenWindow || pastLastEntry) {
      // 计算需要等待的时间
      const waitEstimate = this.estimateWait(poi, atTimeMin, dayOfWeek, dateISO);

      if (pastLastEntry) {
        return {
          feasible: false,
          reason: 'PAST_LAST_ENTRY',
          waitMin: waitEstimate.waitMin,
          inOpenWindow: inOpenWindow,
          pastLastEntry: true,
          isClosedDate: false,
        };
      }

      // 未开门，但可能可以等待
      if (waitEstimate.waitMin > 0 && waitEstimate.waitMin < 180) {
        // 等待时间不超过 3 小时，认为可行（需要等待）
        return {
          feasible: true,
          waitMin: waitEstimate.waitMin,
          inOpenWindow: false,
          pastLastEntry: false,
          isClosedDate: false,
        };
      }

      return {
        feasible: false,
        reason: waitEstimate.reason,
        waitMin: waitEstimate.waitMin,
        inOpenWindow: false,
        pastLastEntry: false,
        isClosedDate: false,
      };
    }

    return {
      feasible: true,
      inOpenWindow: true,
      pastLastEntry: false,
      isClosedDate: false,
    };
  }

  /**
   * 检查交通段是否可行
   */
  isTransitFeasible(
    segment: TransitSegment,
    policy: PlanningPolicy
  ): TransitFeasibility {
    const c = policy.constraints;

    // 硬约束检查
    if (c.requireWheelchairAccess && segment.wheelchairAccessible === false) {
      return {
        feasible: false,
        reason: 'TRANSIT_NOT_WHEELCHAIR_ACCESSIBLE',
        violatesHardConstraints: true,
      };
    }

    if (
      c.forbidStairs &&
      (segment.stairsCount ?? 0) > 0 &&
      segment.elevatorAvailable !== true
    ) {
      return {
        feasible: false,
        reason: 'TRANSIT_HAS_STAIRS_NO_ELEVATOR',
        violatesHardConstraints: true,
      };
    }

    // 单段步行限制
    if (segment.walkMin > c.maxSingleWalkMin) {
      return {
        feasible: false,
        reason: 'TRANSIT_WALK_TOO_LONG',
        violatesHardConstraints: true,
      };
    }

    return {
      feasible: true,
      violatesHardConstraints: false,
    };
  }

  /**
   * 估算等待时间
   * 
   * 考虑：
   * - 开放时间窗口
   * - 节假日特殊时间
   * - 事件影响（如拥挤、临时闭馆）
   */
  estimateWait(
    poi: Poi,
    atTimeMin: number,
    dayOfWeek: DayOfWeek,
    dateISO?: string,
    event?: ReplanEvent
  ): WaitEstimate {
    if (!poi.openingHours) {
      return {
        waitMin: 0,
        reason: 'NO_OPENING_HOURS_DATA',
      };
    }

    const oh = poi.openingHours;

    // 检查闭馆日期
    if (dateISO && oh.closedDates?.includes(dateISO)) {
      return {
        waitMin: Infinity,
        reason: 'CLOSED_DATE',
      };
    }

    // 检查事件影响
    if (event?.type === 'POI_CLOSED' && event.poiId === poi.id) {
      const eff = event.effectiveFromMin ?? 0;
      if (atTimeMin >= eff) {
        return {
          waitMin: Infinity,
          reason: 'POI_CLOSED_BY_EVENT',
        };
      }
    }

    // 收集所有可能的窗口
    const isHolidayToday = dateISO ? isHoliday(dateISO) : false;
    const applicableWindows = oh.windows.filter((w) => {
      if (w.holidayDates && dateISO) {
        return w.holidayDates.includes(dateISO);
      }

      if (w.holidaysOnly !== undefined) {
        if (w.holidaysOnly !== isHolidayToday) {
          return false;
        }
      }

      if (w.dayOfWeek !== undefined) {
        return w.dayOfWeek === dayOfWeek;
      }

      return true;
    });

    if (applicableWindows.length === 0) {
      return {
        waitMin: Infinity,
        reason: 'NO_OPEN_WINDOW',
      };
    }

    // 找到包含当前时间的窗口
    const inWindow = applicableWindows.find(
      (w) =>
        atTimeMin >= this.hhmmToMin(w.start) &&
        atTimeMin <= this.hhmmToMin(w.end)
    );

    if (inWindow) {
      // 已经在开放时间内
      return {
        waitMin: 0,
        reason: 'ALREADY_OPEN',
      };
    }

    // 找下一个窗口开始时间
    const nextStartTimes = applicableWindows
      .map((w) => this.hhmmToMin(w.start))
      .filter((s) => s > atTimeMin)
      .sort((a, b) => a - b);

    if (nextStartTimes.length === 0) {
      return {
        waitMin: Infinity,
        reason: 'CLOSED_REST_OF_DAY',
      };
    }

    const nextOpenMin = nextStartTimes[0];
    const waitMin = nextOpenMin - atTimeMin;

    return {
      waitMin,
      reason: waitMin < 180 ? 'WAIT_UNTIL_OPEN' : 'WAIT_TOO_LONG',
      nextOpenMin,
    };
  }

  /**
   * 计算开放时间窗口的下一段开放时间（分钟数）
   */
  private hhmmToMin(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }
}
