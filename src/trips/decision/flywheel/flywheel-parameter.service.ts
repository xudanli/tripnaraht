/**
 * Flywheel Layer 4: Parameter Set Service
 *
 * 参数版本管理，支持回滚与 A/B。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ObjectiveFunctionWeights,
  DEFAULT_OBJECTIVE_WEIGHTS,
} from '../optimization/objective-function.interface';
import { FlywheelParameterSetInput } from './flywheel-types';

@Injectable()
export class FlywheelParameterService {
  private readonly logger = new Logger(FlywheelParameterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建参数集
   */
  async createParameterSet(input: FlywheelParameterSetInput): Promise<string | null> {
    try {
      const result = await this.prisma.flywheelParameterSet.create({
        data: {
          version: input.version,
          scope: input.scope,
          scopeId: input.scopeId,
          trainingDataRange: input.trainingDataRange as object,
          metrics: input.metrics as object | undefined,
          weights: input.weights as object,
          isActive: input.isActive ?? false,
        },
      });
      this.logger.log(
        `[Flywheel] ParameterSet created: ${result.version} (${result.scope}/${result.scopeId ?? 'global'})`,
      );
      return result.id;
    } catch (error) {
      this.logger.warn(
        `[Flywheel] ParameterSet create failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * 激活某参数集（取消其他同 scope 的激活状态）
   */
  async activateParameterSet(
    parameterSetId: string,
  ): Promise<boolean> {
    try {
      const ps = await this.prisma.flywheelParameterSet.findUnique({
        where: { id: parameterSetId },
      });
      if (!ps) return false;

      await this.prisma.$transaction([
        this.prisma.flywheelParameterSet.updateMany({
          where: { scope: ps.scope, scopeId: ps.scopeId },
          data: { isActive: false },
        }),
        this.prisma.flywheelParameterSet.update({
          where: { id: parameterSetId },
          data: { isActive: true },
        }),
      ]);
      return true;
    } catch (error) {
      this.logger.warn(
        `[Flywheel] Activate failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * 获取用户当前生效的权重
   * 顺序：personal > segment > global
   */
  async getUserWeights(userId: string): Promise<ObjectiveFunctionWeights> {
    const binding = await this.prisma.flywheelUserParameterBinding.findUnique({
      where: { userId },
    });

    if (!binding) {
      return { ...DEFAULT_OBJECTIVE_WEIGHTS };
    }

    const ps = await this.prisma.flywheelParameterSet.findUnique({
      where: { id: binding.parameterSetId },
    });
    if (!ps || !ps.isActive) {
      return { ...DEFAULT_OBJECTIVE_WEIGHTS };
    }

    const weights = ps.weights as Record<string, number>;
    return {
      safety: weights.safety ?? DEFAULT_OBJECTIVE_WEIGHTS.safety,
      experienceDensity: weights.experienceDensity ?? DEFAULT_OBJECTIVE_WEIGHTS.experienceDensity,
      philosophyAlignment: weights.philosophyAlignment ?? DEFAULT_OBJECTIVE_WEIGHTS.philosophyAlignment,
      timeSlack: weights.timeSlack ?? DEFAULT_OBJECTIVE_WEIGHTS.timeSlack,
      fatigueRisk: weights.fatigueRisk ?? DEFAULT_OBJECTIVE_WEIGHTS.fatigueRisk,
      weatherRisk: weights.weatherRisk ?? DEFAULT_OBJECTIVE_WEIGHTS.weatherRisk,
      budgetOverrun: weights.budgetOverrun ?? DEFAULT_OBJECTIVE_WEIGHTS.budgetOverrun,
      pacingVariance: weights.pacingVariance ?? DEFAULT_OBJECTIVE_WEIGHTS.pacingVariance,
    };
  }

  /**
   * 绑定用户到参数版本
   */
  async bindUserToParameterSet(
    userId: string,
    parameterSetId: string,
    parameterVersion: string,
  ): Promise<boolean> {
    try {
      const now = new Date();
      await this.prisma.flywheelUserParameterBinding.upsert({
        where: { userId },
        create: {
          userId,
          parameterSetId,
          parameterVersion,
          effectiveFrom: now,
          effectiveTo: null,
        },
        update: {
          parameterSetId,
          parameterVersion,
          effectiveFrom: now,
          effectiveTo: null,
        },
      });
      return true;
    } catch {
      return false;
    }
  }
}
