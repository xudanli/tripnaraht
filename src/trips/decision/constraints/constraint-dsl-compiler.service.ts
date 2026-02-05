// src/trips/decision/constraints/constraint-dsl-compiler.service.ts

/**
 * 约束DSL编译器
 * 
 * 将统一的约束DSL转换为系统内部使用的policies格式
 * 支持向后兼容：自动识别旧格式并转换
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConstraintDSL, HardConstraints, SoftConstraints } from './constraint-dsl.types';
import { TripWorldState } from '../world-model';

export interface CompiledConstraints {
  hardConstraints: Record<string, any>;
  softConstraints: Record<string, any>;
  objectives: Record<string, any>;
}

@Injectable()
export class ConstraintDSLCompiler {
  private readonly logger = new Logger(ConstraintDSLCompiler.name);

  /**
   * 编译约束DSL为系统内部格式
   * 
   * @param dsl 约束DSL
   * @param state 世界状态（用于获取pace等上下文信息）
   * @returns 编译后的约束
   */
  compile(dsl: ConstraintDSL | any, state: TripWorldState): CompiledConstraints {
    // 检测是否为旧格式
    if (this.isLegacyFormat(dsl)) {
      this.logger.debug('检测到旧格式约束，自动转换');
      return this.compileLegacyFormat(dsl, state);
    }

    // 新格式编译
    return this.compileNewFormat(dsl, state);
  }

  /**
   * 检测是否为旧格式
   */
  private isLegacyFormat(constraints: any): boolean {
    // 旧格式特征：没有 hard_constraints 和 soft_constraints 字段
    // 但有 maxElevationM、maxDailyAscentM 等字段
    return (
      !constraints.hard_constraints &&
      !constraints.soft_constraints &&
      (constraints.maxElevationM !== undefined ||
        constraints.maxDailyAscentM !== undefined ||
        constraints.maxSlope !== undefined)
    );
  }

  /**
   * 编译新格式DSL
   */
  private compileNewFormat(dsl: ConstraintDSL, state: TripWorldState): CompiledConstraints {
    const hardConstraints: Record<string, any> = {};
    const softConstraints: Record<string, any> = {};
    const objectives: Record<string, any> = {};

    const pace = state.context.preferences.pace || 'moderate';
    const paceMultiplier = this.getPaceMultiplier(pace);

    // 编译硬约束
    if (dsl.hard_constraints) {
      this.compileHardConstraints(dsl.hard_constraints, hardConstraints);
    }

    // 编译软约束（根据pace调整）
    if (dsl.soft_constraints) {
      this.compileSoftConstraints(dsl.soft_constraints, softConstraints, paceMultiplier);
    }

    // 编译目标函数（从软约束中提取）
    this.extractObjectives(dsl.soft_constraints, objectives);

    return {
      hardConstraints,
      softConstraints,
      objectives,
    };
  }

  /**
   * 编译硬约束
   */
  private compileHardConstraints(
    hard: HardConstraints,
    output: Record<string, any>
  ): void {
    // 日期窗口
    if (hard.date_window) {
      // 硬约束中日期窗口通常不需要转换，保留在metadata中
      output.date_window = hard.date_window;
    }

    // 预算
    if (hard.budget) {
      output.budget = {
        max: hard.budget.max,
        currency: hard.budget.currency,
        flexible: hard.budget.flexible,
      };
    }

    // 物理限制
    if (hard.physical_limitations) {
      const pl = hard.physical_limitations;
      if (pl.max_daily_ascent_m !== undefined) {
        output.maxDailyRapidAscentM = pl.max_daily_ascent_m;
      }
      if (pl.max_elevation_m !== undefined) {
        output.maxElevationM = pl.max_elevation_m;
      }
      if (pl.max_slope_pct !== undefined) {
        output.maxSlopePct = pl.max_slope_pct;
      }
      if (pl.rapid_ascent_forbidden !== undefined) {
        output.rapidAscentForbidden = pl.rapid_ascent_forbidden;
      }
      if (pl.daily_activity_hours_max !== undefined) {
        output.dailyActivityHoursMax = pl.daily_activity_hours_max;
      }
      if (pl.wheelchair_accessible !== undefined) {
        output.wheelchairAccessible = pl.wheelchair_accessible;
      }
      if (pl.no_stairs !== undefined) {
        output.noStairs = pl.no_stairs;
      }
      if (pl.no_long_hiking !== undefined) {
        output.noLongHiking = pl.no_long_hiking;
      }
    }

    // 交通方式
    if (hard.travel_mode) {
      const tm = hard.travel_mode;
      if (tm.allow_self_drive !== undefined) {
        output.allowSelfDrive = tm.allow_self_drive;
      }
      if (tm.max_transfers !== undefined) {
        output.maxTransfers = tm.max_transfers;
      }
      if (tm.no_early_morning !== undefined) {
        output.noEarlyMorning = tm.no_early_morning;
      }
      if (tm.no_late_night !== undefined) {
        output.noLateNight = tm.no_late_night;
      }
    }

    // 许可和向导要求
    if (hard.requirements) {
      const req = hard.requirements;
      if (req.requires_permit !== undefined) {
        output.requiresPermit = req.requires_permit;
      }
      if (req.requires_guide !== undefined) {
        output.requiresGuide = req.requires_guide;
      }
    }
  }

  /**
   * 编译软约束（根据pace调整）
   */
  private compileSoftConstraints(
    soft: SoftConstraints,
    output: Record<string, any>,
    paceMultiplier: { ascent: number; elevation: number; buffer: number }
  ): void {
    // 节奏偏好（转换为目标函数权重）
    if (soft.pace) {
      output.pacePreference = soft.pace.preference;
      output.paceWeight = soft.pace.weight;
    }

    // 风景偏好
    if (soft.scenery) {
      output.sceneryPreference = soft.scenery.nature_vs_city;
      output.sceneryWeight = soft.scenery.weight;
    }

    // 摄影重要性
    if (soft.photography) {
      output.photographyImportance = soft.photography.importance;
    }

    // 舒适度偏好
    if (soft.comfort_level) {
      output.hotelQuality = soft.comfort_level.hotel_quality;
      output.comfortWeight = soft.comfort_level.weight;
    }

    // 活动强度偏好
    if (soft.activity_intensity) {
      output.activityIntensityPreference = soft.activity_intensity.preference;
      output.activityIntensityWeight = soft.activity_intensity.weight;
    }

    // 风险容忍度
    if (soft.risk_tolerance) {
      output.riskTolerance = soft.risk_tolerance.level;
      output.riskToleranceWeight = soft.risk_tolerance.weight;
    }

    // 成本敏感度
    if (soft.cost_sensitivity) {
      output.costSensitivity = soft.cost_sensitivity.level;
      output.costSensitivityWeight = soft.cost_sensitivity.weight;
    }
  }

  /**
   * 从软约束中提取目标函数
   */
  private extractObjectives(
    soft: SoftConstraints | undefined,
    output: Record<string, any>
  ): void {
    if (!soft) return;

    // 摄影偏好 -> preferPhotography
    if (soft.photography && soft.photography.importance > 0.5) {
      output.preferPhotography = true;
    }

    // 风景偏好 -> preferViewpoints (如果是nature)
    if (soft.scenery && soft.scenery.nature_vs_city === 'nature') {
      output.preferViewpoints = true;
    }

    // 舒适度偏好 -> preferHotSpring (如果是high)
    if (soft.comfort_level && soft.comfort_level.hotel_quality === 'high') {
      output.preferHotSpring = true; // 可以扩展为更通用的舒适度偏好
    }
  }

  /**
   * 编译旧格式（向后兼容）
   */
  private compileLegacyFormat(
    constraints: any,
    state: TripWorldState
  ): CompiledConstraints {
    const hardConstraints: Record<string, any> = {};
    const softConstraints: Record<string, any> = {};
    const objectives: Record<string, any> = {};

    const pace = state.context.preferences.pace || 'moderate';
    const paceMultiplier = this.getPaceMultiplier(pace);

    // 旧格式的硬约束
    if (constraints.maxSlope !== undefined) {
      hardConstraints.maxSlopePct = constraints.maxSlope;
    }
    if (constraints.rapidAscentForbidden !== undefined) {
      hardConstraints.rapidAscentForbidden = constraints.rapidAscentForbidden;
    }

    // 旧格式的软约束（根据pace调整）
    if (constraints.maxElevationM !== undefined) {
      softConstraints.maxElevationM = Math.round(
        constraints.maxElevationM * paceMultiplier.elevation
      );
    }
    if (constraints.maxDailyAscentM !== undefined) {
      softConstraints.maxDailyAscentM = Math.round(
        constraints.maxDailyAscentM * paceMultiplier.ascent
      );
    }
    if (constraints.bufferTimeMin !== undefined) {
      softConstraints.bufferTimeMin = Math.round(
        constraints.bufferTimeMin * paceMultiplier.buffer
      );
    }

    // 旧格式的目标函数
    if (constraints.preferViewpoints !== undefined) {
      objectives.preferViewpoints = constraints.preferViewpoints;
    }
    if (constraints.preferHotSpring !== undefined) {
      objectives.preferHotSpring = constraints.preferHotSpring;
    }
    if (constraints.preferPhotography !== undefined) {
      objectives.preferPhotography = constraints.preferPhotography;
    }

    return {
      hardConstraints,
      softConstraints,
      objectives,
    };
  }

  /**
   * 根据pace获取约束调整倍数
   */
  private getPaceMultiplier(pace: 'relaxed' | 'moderate' | 'intense'): {
    ascent: number;
    elevation: number;
    buffer: number;
  } {
    switch (pace) {
      case 'relaxed':
        return {
          ascent: 0.7, // 降低 30%
          elevation: 0.8, // 降低 20%
          buffer: 1.5, // 增加 50%
        };
      case 'intense':
        return {
          ascent: 1.2, // 提高 20%
          elevation: 1.1, // 提高 10%
          buffer: 0.7, // 减少 30%
        };
      case 'moderate':
      default:
        return {
          ascent: 1.0,
          elevation: 1.0,
          buffer: 1.0,
        };
    }
  }
}
