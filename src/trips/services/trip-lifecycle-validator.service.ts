// src/trips/services/trip-lifecycle-validator.service.ts
/**
 * Trip Lifecycle Transition Validator
 *
 * 职责：验证 Trip 状态转换的合法性
 *
 * 设计原则：
 * - 正向验证：不仅阻止非法转换，还要验证转换的前置条件
 * - 状态驱动：每个状态转换都有明确的业务规则
 * - 可扩展：支持未来添加更多状态和转换规则
 */

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { TripStatus, normalizeTripStatus } from '../dto/trip-status.dto';
import { Trip } from '@prisma/client';

/**
 * 状态转换验证结果
 */
export interface TransitionValidationResult {
  /** 是否允许转换 */
  allowed: boolean;

  /** 拒绝原因（如果不允许） */
  reason?: string;

  /** 缺失的前置条件（如果不允许） */
  missingConditions?: string[];
}

/**
 * Trip 上下文（用于验证转换条件）
 */
export interface TripContext {
  /** 目的地 */
  destination?: string;

  /** 开始日期 */
  startDate?: Date;

  /** 结束日期 */
  endDate?: Date;

  /** 预算配置 */
  budgetConfig?: any;

  /** 已接受的成员数量 */
  acceptedMemberCount?: number;

  /** 最小成员数要求 */
  minMembers?: number;

  /** 成员确认状态 */
  memberConfirmations?: boolean;

  /** 计划确认状态 */
  planConfirmed?: boolean;

  /** 行程是否已结束 */
  tripEnded?: boolean;
}

/**
 * 从 Trip 实体提取上下文
 */
export function extractTripContext(trip: Trip): TripContext {
  const budgetConfig = trip.budgetConfig as any;
  const metadata = trip.metadata as any;

  return {
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    budgetConfig: budgetConfig,
    acceptedMemberCount: metadata?.acceptedMemberCount,
    minMembers: metadata?.minMembers,
    memberConfirmations: metadata?.memberConfirmations,
    planConfirmed: metadata?.planConfirmed,
    tripEnded: metadata?.tripEnded,
  };
}

@Injectable()
export class TripLifecycleValidatorService {
  private readonly logger = new Logger(TripLifecycleValidatorService.name);

  /**
   * 验证状态转换
   *
   * @param currentStatus 当前状态
   * @param newStatus 目标状态
   * @param context Trip 上下文
   * @returns 验证结果
   */
  validateTransition(
    currentStatus: string | null,
    newStatus: TripStatus,
    context?: TripContext,
  ): TransitionValidationResult {
    const normalizedCurrent = normalizeTripStatus(currentStatus);
    const normalizedNew = normalizeTripStatus(newStatus);

    this.logger.debug(
      `Validating transition: ${normalizedCurrent} → ${normalizedNew}`,
    );

    // 如果状态相同，允许（幂等操作）
    if (normalizedCurrent === normalizedNew) {
      return { allowed: true };
    }

    // 检查是否是允许的转换路径
    const allowed = this.isAllowedTransition(normalizedCurrent, normalizedNew);
    if (!allowed) {
      return {
        allowed: false,
        reason: `不允许从 ${normalizedCurrent} 转换到 ${normalizedNew}`,
      };
    }

    // 执行正向验证（检查前置条件）
    return this.validateTransitionConditions(
      normalizedCurrent,
      normalizedNew,
      context,
    );
  }

  /**
   * 检查是否是允许的转换路径
   *
   * 允许的转换：
   * - DRAFT → RECRUITING
   * - DRAFT → PLANNING (跳过招募阶段)
   * - RECRUITING → FORMING
   * - RECRUITING → PLANNING (跳过预成团)
   * - FORMING → PLANNING
   * - PLANNING → TRAVELING
   * - TRAVELING → COMPLETED
   * - 任何状态 → CANCELLED
   *
   * 不允许的转换：
   * - CANCELLED → 任何状态
   * - COMPLETED → PLANNING / TRAVELING
   * - TRAVELING → PLANNING
   */
  private isAllowedTransition(
    current: TripStatus,
    target: TripStatus,
  ): boolean {
    // 已取消的行程不能改回其他状态
    if (current === TripStatus.CANCELLED) {
      return false;
    }

    // 已完成的行程不能改回规划中或旅行中
    if (
      current === TripStatus.COMPLETED &&
      (target === TripStatus.PLANNING || target === TripStatus.TRAVELING)
    ) {
      return false;
    }

    // 旅行中的行程不能改回规划中
    if (current === TripStatus.TRAVELING && target === TripStatus.PLANNING) {
      return false;
    }

    // 任何状态都可以取消
    if (target === TripStatus.CANCELLED) {
      return true;
    }

    // 定义允许的转换路径
    // 使用 Partial 因为 IN_PROGRESS 已废弃，在验证前会被 normalize 为 TRAVELING
    const transitionMap: Partial<Record<TripStatus, TripStatus[]>> = {
      [TripStatus.DRAFT]: [
        TripStatus.RECRUITING,
        TripStatus.PLANNING, // 允许跳过招募
      ],
      [TripStatus.RECRUITING]: [
        TripStatus.FORMING,
        TripStatus.PLANNING, // 允许跳过预成团
      ],
      [TripStatus.FORMING]: [TripStatus.PLANNING],
      [TripStatus.PLANNING]: [TripStatus.TRAVELING],
      [TripStatus.TRAVELING]: [TripStatus.COMPLETED],
      [TripStatus.COMPLETED]: [],
      [TripStatus.CANCELLED]: [],
    };

    return transitionMap[current]?.includes(target) ?? false;
  }

  /**
   * 验证转换的前置条件（正向验证）
   */
  private validateTransitionConditions(
    current: TripStatus,
    target: TripStatus,
    context?: TripContext,
  ): TransitionValidationResult {
    const missingConditions: string[] = [];

    switch (current) {
      case TripStatus.DRAFT:
        if (target === TripStatus.RECRUITING) {
          return this.validateDraftToRecruiting(context, missingConditions);
        }
        if (target === TripStatus.PLANNING) {
          return this.validateDraftToPlanning(context, missingConditions);
        }
        break;

      case TripStatus.RECRUITING:
        if (target === TripStatus.FORMING) {
          return this.validateRecruitingToForming(context, missingConditions);
        }
        if (target === TripStatus.PLANNING) {
          return this.validateRecruitingToPlanning(context, missingConditions);
        }
        break;

      case TripStatus.FORMING:
        if (target === TripStatus.PLANNING) {
          return this.validateFormingToPlanning(context, missingConditions);
        }
        break;

      case TripStatus.PLANNING:
        if (target === TripStatus.TRAVELING) {
          return this.validatePlanningToTraveling(context, missingConditions);
        }
        break;

      case TripStatus.TRAVELING:
        if (target === TripStatus.COMPLETED) {
          return this.validateTravelingToCompleted(context, missingConditions);
        }
        break;
    }

    // 默认允许（如果没有特定规则）
    return { allowed: true };
  }

  /**
   * DRAFT → RECRUITING: 需要目的地、日期、预算
   */
  private validateDraftToRecruiting(
    context?: TripContext,
    missingConditions?: string[],
  ): TransitionValidationResult {
    if (!context?.destination) {
      missingConditions?.push('目的地');
    }
    if (!context?.startDate) {
      missingConditions?.push('开始日期');
    }
    if (!context?.endDate) {
      missingConditions?.push('结束日期');
    }
    if (!context?.budgetConfig) {
      missingConditions?.push('预算配置');
    }

    if (missingConditions && missingConditions.length > 0) {
      return {
        allowed: false,
        reason: `进入招募阶段需要：${missingConditions.join('、')}`,
        missingConditions,
      };
    }

    return { allowed: true };
  }

  /**
   * DRAFT → PLANNING: 需要目的地、日期、预算
   */
  private validateDraftToPlanning(
    context?: TripContext,
    missingConditions?: string[],
  ): TransitionValidationResult {
    if (!context?.destination) {
      missingConditions?.push('目的地');
    }
    if (!context?.startDate) {
      missingConditions?.push('开始日期');
    }
    if (!context?.endDate) {
      missingConditions?.push('结束日期');
    }
    if (!context?.budgetConfig) {
      missingConditions?.push('预算配置');
    }

    if (missingConditions && missingConditions.length > 0) {
      return {
        allowed: false,
        reason: `进入规划阶段需要：${missingConditions.join('、')}`,
        missingConditions,
      };
    }

    return { allowed: true };
  }

  /**
   * RECRUITING → FORMING: 需要最低成员数
   */
  private validateRecruitingToForming(
    context?: TripContext,
    missingConditions?: string[],
  ): TransitionValidationResult {
    const minMembers = context?.minMembers ?? 1;
    const acceptedCount = context?.acceptedMemberCount ?? 0;

    if (acceptedCount < minMembers) {
      missingConditions?.push(
        `至少 ${minMembers} 名已接受成员（当前：${acceptedCount}）`,
      );
    }

    if (missingConditions && missingConditions.length > 0) {
      return {
        allowed: false,
        reason: `进入预成团阶段需要：${missingConditions.join('、')}`,
        missingConditions,
      };
    }

    return { allowed: true };
  }

  /**
   * RECRUITING → PLANNING: 需要最低成员数
   */
  private validateRecruitingToPlanning(
    context?: TripContext,
    missingConditions?: string[],
  ): TransitionValidationResult {
    const minMembers = context?.minMembers ?? 1;
    const acceptedCount = context?.acceptedMemberCount ?? 0;

    if (acceptedCount < minMembers) {
      missingConditions?.push(
        `至少 ${minMembers} 名已接受成员（当前：${acceptedCount}）`,
      );
    }

    if (missingConditions && missingConditions.length > 0) {
      return {
        allowed: false,
        reason: `进入规划阶段需要：${missingConditions.join('、')}`,
        missingConditions,
      };
    }

    return { allowed: true };
  }

  /**
   * FORMING → PLANNING: 需要成员确认
   */
  private validateFormingToPlanning(
    context?: TripContext,
    missingConditions?: string[],
  ): TransitionValidationResult {
    if (!context?.memberConfirmations) {
      missingConditions?.push('成员确认');
    }

    if (missingConditions && missingConditions.length > 0) {
      return {
        allowed: false,
        reason: `进入规划阶段需要：${missingConditions.join('、')}`,
        missingConditions,
      };
    }

    return { allowed: true };
  }

  /**
   * PLANNING → TRAVELING: 需要计划确认和出发时间
   */
  private validatePlanningToTraveling(
    context?: TripContext,
    missingConditions?: string[],
  ): TransitionValidationResult {
    if (!context?.planConfirmed) {
      missingConditions?.push('计划确认');
    }
    if (!context?.startDate) {
      missingConditions?.push('出发时间');
    }

    if (missingConditions && missingConditions.length > 0) {
      return {
        allowed: false,
        reason: `进入旅行阶段需要：${missingConditions.join('、')}`,
        missingConditions,
      };
    }

    return { allowed: true };
  }

  /**
   * TRAVELING → COMPLETED: 需要行程结束条件
   */
  private validateTravelingToCompleted(
    context?: TripContext,
    missingConditions?: string[],
  ): TransitionValidationResult {
    if (!context?.tripEnded) {
      missingConditions?.push('行程结束确认');
    }

    if (missingConditions && missingConditions.length > 0) {
      return {
        allowed: false,
        reason: `完成行程需要：${missingConditions.join('、')}`,
        missingConditions,
      };
    }

    return { allowed: true };
  }

  /**
   * 便捷方法：验证并抛出异常（用于服务层）
   */
  validateTransitionOrThrow(
    currentStatus: string | null,
    newStatus: TripStatus,
    context?: TripContext,
  ): void {
    const result = this.validateTransition(currentStatus, newStatus, context);

    if (!result.allowed) {
      throw new BadRequestException(
        result.reason || '状态转换不被允许',
      );
    }
  }
}
