// src/agent/memory/services/user-profile-mapper.service.ts

/**
 * User Profile → Decision Params 映射服务
 * 
 * 将用户画像转化为决策引擎可直接使用的参数
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  UserTravelProfile,
  PacePreference,
  AltitudeTolerance,
  RiskTolerance,
  TravelPhilosophy,
} from '../interfaces/user-travel-profile.interface';
import {
  DecisionParams,
  createDefaultDecisionParams,
  normalizeDecisionParams,
} from '../interfaces/decision-params.interface';

@Injectable()
export class UserProfileMapperService {
  private readonly logger = new Logger(UserProfileMapperService.name);

  /**
   * 将用户画像映射为决策参数
   * 
   * 这是核心映射函数，将"懂用户"转化为"可执行的参数"
   */
  mapUserProfileToDecisionParams(profile: UserTravelProfile): DecisionParams {
    const params = createDefaultDecisionParams();

    // 根据置信度调整影响幅度
    const confidenceMultiplier = profile.confidence < 0.5 ? 0.5 : 1.0;

    // 1. Pace → 节奏 & 策略
    this.applyPacePreference(params, profile.pacePreference, confidenceMultiplier);

    // 2. AltitudeTolerance → DEM 硬约束
    this.applyAltitudeTolerance(params, profile.altitudeTolerance, confidenceMultiplier);

    // 3. RiskTolerance → RouteDirection & 策略
    this.applyRiskTolerance(params, profile.riskTolerance, confidenceMultiplier);

    // 4. TravelPhilosophy → 目标函数权重
    this.applyTravelPhilosophy(params, profile.travelPhilosophy, confidenceMultiplier);

    // 5. PreferredRouteTypes → RouteDirection 过滤（在 RouteDirectionSelectorService 中处理）

    // 归一化参数
    return normalizeDecisionParams(params);
  }

  /**
   * 应用节奏偏好
   */
  private applyPacePreference(
    params: DecisionParams,
    pace?: PacePreference,
    multiplier: number = 1.0
  ): void {
    if (!pace) return;

    switch (pace) {
      case 'SLOW':
        // 加 buffer、拆天、优先休息
        params.constraints.bufferTimeMin = (params.constraints.bufferTimeMin || 15) + 60 * multiplier;
        params.strategyPreference.abuWeight += 0.2 * multiplier;
        params.repairPolicy.preferRestDay = true;
        params.repairPolicy.preferSplitDays = true;
        break;

      case 'FAST':
        // 压缩天数、允许高强度
        params.constraints.bufferTimeMin = Math.max(5, (params.constraints.bufferTimeMin || 15) - 10 * multiplier);
        params.strategyPreference.drDreWeight += 0.15 * multiplier;
        params.routeDirectionBias.difficultyWeight += 0.2 * multiplier;
        break;

      case 'MODERATE':
      default:
        // 保持默认平衡
        break;
    }
  }

  /**
   * 应用海拔耐受度
   */
  private applyAltitudeTolerance(
    params: DecisionParams,
    altitude?: AltitudeTolerance,
    multiplier: number = 1.0
  ): void {
    if (!altitude) return;

    switch (altitude) {
      case 'LOW':
        // 禁止高海拔
        params.constraints.maxElevationM = 3500;
        params.constraints.avoidRapidAscent = true;
        params.constraints.maxDailyAscentM = 500 * multiplier;
        break;

      case 'MEDIUM':
        // 允许但需适应
        params.constraints.maxElevationM = 4500;
        params.constraints.maxDailyAscentM = 800 * multiplier;
        break;

      case 'HIGH':
        // 放宽限制
        params.constraints.maxElevationM = 6000;
        params.constraints.maxDailyAscentM = 1200 * multiplier;
        break;
    }
  }

  /**
   * 应用风险耐受度
   */
  private applyRiskTolerance(
    params: DecisionParams,
    risk?: RiskTolerance,
    multiplier: number = 1.0
  ): void {
    if (!risk) return;

    switch (risk) {
      case 'LOW':
        // 强烈偏向稳定路线
        params.routeDirectionBias.stabilityWeight += 0.3 * multiplier;
        params.strategyPreference.abuWeight += 0.3 * multiplier;
        params.repairPolicy.preferAltRoute = true;
        break;

      case 'MEDIUM':
        // 保持平衡
        break;

      case 'HIGH':
        // 接受边缘路线
        params.routeDirectionBias.adventureWeight += 0.3 * multiplier;
        params.routeDirectionBias.difficultyWeight += 0.2 * multiplier;
        params.strategyPreference.neptuneWeight += 0.2 * multiplier;
        break;
    }
  }

  /**
   * 应用旅行哲学
   */
  private applyTravelPhilosophy(
    params: DecisionParams,
    philosophy?: TravelPhilosophy,
    multiplier: number = 1.0
  ): void {
    if (!philosophy) return;

    switch (philosophy) {
      case 'SCENIC':
        // 偏好风景
        params.routeDirectionBias.sceneryWeight += 0.4 * multiplier;
        params.routeDirectionBias.difficultyWeight -= 0.2 * multiplier;
        break;

      case 'ADVENTURE':
        // 偏好挑战
        params.routeDirectionBias.adventureWeight += 0.4 * multiplier;
        params.routeDirectionBias.difficultyWeight += 0.3 * multiplier;
        params.routeDirectionBias.stabilityWeight -= 0.2 * multiplier;
        break;

      case 'RELAXED':
        // 偏好放松
        params.routeDirectionBias.stabilityWeight += 0.3 * multiplier;
        params.routeDirectionBias.difficultyWeight -= 0.3 * multiplier;
        params.repairPolicy.preferRestDay = true;
        break;
    }
  }

  /**
   * 合并多个决策参数（用于多用户或混合场景）
   */
  mergeDecisionParams(paramsList: DecisionParams[]): DecisionParams {
    if (paramsList.length === 0) {
      return createDefaultDecisionParams();
    }

    if (paramsList.length === 1) {
      return paramsList[0];
    }

    // 简单平均合并
    const merged = createDefaultDecisionParams();

    // 合并 RouteDirection 权重
    paramsList.forEach(params => {
      merged.routeDirectionBias.difficultyWeight += params.routeDirectionBias.difficultyWeight;
      merged.routeDirectionBias.sceneryWeight += params.routeDirectionBias.sceneryWeight;
      merged.routeDirectionBias.adventureWeight += params.routeDirectionBias.adventureWeight;
      merged.routeDirectionBias.stabilityWeight += params.routeDirectionBias.stabilityWeight;
    });

    const count = paramsList.length;
    merged.routeDirectionBias.difficultyWeight /= count;
    merged.routeDirectionBias.sceneryWeight /= count;
    merged.routeDirectionBias.adventureWeight /= count;
    merged.routeDirectionBias.stabilityWeight /= count;

    // 合并策略权重
    paramsList.forEach(params => {
      merged.strategyPreference.abuWeight += params.strategyPreference.abuWeight;
      merged.strategyPreference.drDreWeight += params.strategyPreference.drDreWeight;
      merged.strategyPreference.neptuneWeight += params.strategyPreference.neptuneWeight;
    });

    merged.strategyPreference.abuWeight /= count;
    merged.strategyPreference.drDreWeight /= count;
    merged.strategyPreference.neptuneWeight /= count;

    // 合并约束（取最严格的值）
    paramsList.forEach(params => {
      if (params.constraints.maxElevationM) {
        if (!merged.constraints.maxElevationM || params.constraints.maxElevationM < merged.constraints.maxElevationM) {
          merged.constraints.maxElevationM = params.constraints.maxElevationM;
        }
      }
      if (params.constraints.maxDailyAscentM) {
        if (!merged.constraints.maxDailyAscentM || params.constraints.maxDailyAscentM < merged.constraints.maxDailyAscentM) {
          merged.constraints.maxDailyAscentM = params.constraints.maxDailyAscentM;
        }
      }
      if (params.constraints.bufferTimeMin) {
        if (!merged.constraints.bufferTimeMin || params.constraints.bufferTimeMin > merged.constraints.bufferTimeMin) {
          merged.constraints.bufferTimeMin = params.constraints.bufferTimeMin;
        }
      }
      if (params.constraints.avoidRapidAscent) {
        merged.constraints.avoidRapidAscent = true;
      }
    });

    // 合并修复策略（任一为 true 则为 true）
    merged.repairPolicy.preferSplitDays = paramsList.some(p => p.repairPolicy.preferSplitDays);
    merged.repairPolicy.preferAltRoute = paramsList.some(p => p.repairPolicy.preferAltRoute);
    merged.repairPolicy.preferRestDay = paramsList.some(p => p.repairPolicy.preferRestDay);

    return normalizeDecisionParams(merged);
  }
}

