// src/trips/decision/services/dem-daily-energy.service.ts
/**
 * DEM 驱动的每日体力预算服务
 * 
 * 功能：根据DEM数据动态计算每日体力消耗预算
 * 
 * dailyEnergyCost = 
 *   distanceKm * baseCost
 *   + ascentM * ascentFactor
 *   + slopePenalty
 *   + altitudePenalty
 * 
 * 同一条路线，不同 RouteDirection，每天走法不同
 */

import { Injectable, Logger } from '@nestjs/common';
import { DEMEffortMetadataService, RoutePoint } from '../../readiness/services/dem-effort-metadata.service';
import { GeoPoint } from '../world-model';
import { PlanDay, PlanSlot } from '../plan-model';

export interface DailyEnergyBudget {
  /** 每日最大体力消耗（0-100，归一化） */
  maxEnergyCost: number;
  /** 每日基础体力消耗（基于距离） */
  baseEnergyCost: number;
  /** 爬升体力消耗 */
  ascentEnergyCost: number;
  /** 坡度惩罚 */
  slopePenalty: number;
  /** 海拔惩罚 */
  altitudePenalty: number;
  /** 总消耗 */
  totalEnergyCost: number;
  /** 剩余体力预算 */
  remainingBudget: number;
}

export interface DailyEnergyConfig {
  /** 基础体力消耗系数（每公里） */
  baseCostPerKm?: number;
  /** 爬升体力消耗系数（每米爬升） */
  ascentFactor?: number;
  /** 坡度惩罚系数 */
  slopePenaltyFactor?: number;
  /** 海拔惩罚系数（超过3000m开始惩罚） */
  altitudePenaltyFactor?: number;
  /** 海拔惩罚起始高度（米） */
  altitudePenaltyStart?: number;
  /** 每日最大体力预算（归一化，0-100） */
  maxDailyBudget?: number;
}

@Injectable()
export class DEMDailyEnergyService {
  private readonly logger = new Logger(DEMDailyEnergyService.name);

  constructor(
    private readonly demEffortService: DEMEffortMetadataService
  ) {}

  /**
   * 计算一天的体力消耗预算
   * 
   * @param day 计划的一天
   * @param config 配置参数
   * @returns 每日体力预算
   */
  async calculateDailyEnergyBudget(
    day: PlanDay,
    config: DailyEnergyConfig = {}
  ): Promise<DailyEnergyBudget> {
    const {
      baseCostPerKm = 5, // 每公里基础消耗5点
      ascentFactor = 0.1, // 每米爬升消耗0.1点
      slopePenaltyFactor = 0.5, // 坡度惩罚系数
      altitudePenaltyFactor = 0.05, // 海拔惩罚系数
      altitudePenaltyStart = 3000, // 3000m开始惩罚
      maxDailyBudget = 100, // 每日最大预算100点
    } = config;

    // 1. 提取当天的所有活动点
    const routePoints = this.extractRoutePoints(day);

    if (routePoints.length < 2) {
      // 如果活动点不足，返回默认预算
      return {
        maxEnergyCost: maxDailyBudget,
        baseEnergyCost: 0,
        ascentEnergyCost: 0,
        slopePenalty: 0,
        altitudePenalty: 0,
        totalEnergyCost: 0,
        remainingBudget: maxDailyBudget,
      };
    }

    // 2. 使用DEM服务计算体力消耗元数据
    const effortMetadata = await this.demEffortService.calculateEffortMetadata(
      routePoints,
      {
        activityType: 'walking',
        includeElevationProfile: true,
      }
    );

    // 3. 计算各项体力消耗
    const distanceKm = effortMetadata.totalDistance / 1000;
    const baseEnergyCost = distanceKm * baseCostPerKm;

    const ascentM = effortMetadata.totalAscent;
    const ascentEnergyCost = ascentM * ascentFactor;

    // 坡度惩罚：基于平均坡度
    const avgSlope = effortMetadata.avgSlope;
    const slopePenalty = avgSlope > 10 
      ? (avgSlope - 10) * slopePenaltyFactor 
      : 0;

    // 海拔惩罚：基于最高海拔
    const maxElevation = effortMetadata.maxElevation;
    const altitudePenalty = maxElevation > altitudePenaltyStart
      ? (maxElevation - altitudePenaltyStart) * altitudePenaltyFactor
      : 0;

    // 4. 计算总消耗
    const totalEnergyCost = baseEnergyCost + ascentEnergyCost + slopePenalty + altitudePenalty;

    // 5. 计算剩余预算
    const remainingBudget = Math.max(0, maxDailyBudget - totalEnergyCost);

    return {
      maxEnergyCost: maxDailyBudget,
      baseEnergyCost: Math.round(baseEnergyCost * 100) / 100,
      ascentEnergyCost: Math.round(ascentEnergyCost * 100) / 100,
      slopePenalty: Math.round(slopePenalty * 100) / 100,
      altitudePenalty: Math.round(altitudePenalty * 100) / 100,
      totalEnergyCost: Math.round(totalEnergyCost * 100) / 100,
      remainingBudget: Math.round(remainingBudget * 100) / 100,
    };
  }

  /**
   * 根据RouteDirection动态调整每日体力预算
   * 
   * 不同RouteDirection有不同的体力消耗特征，需要动态调整预算
   * 
   * @param day 计划的一天
   * @param routeDirection 路线方向（包含约束和风险画像）
   * @param userPace 用户节奏偏好
   * @returns 调整后的每日体力预算
   */
  async calculateDynamicDailyBudget(
    day: PlanDay,
    routeDirection?: any,
    userPace: 'relaxed' | 'moderate' | 'intense' = 'moderate'
  ): Promise<DailyEnergyBudget> {
    // 根据用户节奏调整基础配置
    const paceMultipliers = {
      relaxed: { baseCost: 0.8, ascent: 0.7, maxBudget: 80 },
      moderate: { baseCost: 1.0, ascent: 1.0, maxBudget: 100 },
      intense: { baseCost: 1.2, ascent: 1.3, maxBudget: 120 },
    };

    const multiplier = paceMultipliers[userPace];

    // 根据RouteDirection约束调整配置
    const constraints = routeDirection?.constraints || {};
    const softConstraints = constraints.soft || {};
    const hardConstraints = constraints.hard || {};

    // 如果RouteDirection有maxDailyAscentM限制，调整爬升系数
    const maxDailyAscentM = softConstraints.maxDailyAscentM || hardConstraints.maxDailyRapidAscentM;
    const ascentFactor = maxDailyAscentM 
      ? (100 / maxDailyAscentM) * 0.1 // 根据限制动态调整
      : 0.1;

    // 如果RouteDirection有maxElevationM限制，调整海拔惩罚起始点
    const maxElevationM = softConstraints.maxElevationM || constraints.maxElevationM;
    const altitudePenaltyStart = maxElevationM 
      ? Math.max(2000, maxElevationM - 1000) // 在限制以下1000m开始惩罚
      : 3000;

    const config: DailyEnergyConfig = {
      baseCostPerKm: 5 * multiplier.baseCost,
      ascentFactor: ascentFactor * multiplier.ascent,
      slopePenaltyFactor: 0.5,
      altitudePenaltyFactor: 0.05,
      altitudePenaltyStart,
      maxDailyBudget: multiplier.maxBudget,
    };

    return this.calculateDailyEnergyBudget(day, config);
  }

  /**
   * 从PlanDay中提取路线点
   */
  private extractRoutePoints(day: PlanDay): RoutePoint[] {
    const points: RoutePoint[] = [];

    for (const slot of day.timeSlots) {
      if (slot.coordinates) {
        points.push({
          lat: slot.coordinates.lat,
          lng: slot.coordinates.lng,
        });
      } else if (slot.travelLegFromPrev?.to) {
        // 如果有travel leg，使用终点
        points.push({
          lat: slot.travelLegFromPrev.to.lat,
          lng: slot.travelLegFromPrev.to.lng,
        });
      }
    }

    return points;
  }

  /**
   * 检查一天的体力预算是否超限
   */
  async checkDailyBudgetExceeded(
    day: PlanDay,
    routeDirection?: any,
    userPace: 'relaxed' | 'moderate' | 'intense' = 'moderate'
  ): Promise<{ exceeded: boolean; budget: DailyEnergyBudget; warning?: string }> {
    const budget = await this.calculateDynamicDailyBudget(day, routeDirection, userPace);

    const exceeded = budget.totalEnergyCost > budget.maxEnergyCost;
    const warning = exceeded
      ? `体力预算超限：消耗 ${budget.totalEnergyCost.toFixed(1)}，预算 ${budget.maxEnergyCost}`
      : budget.totalEnergyCost > budget.maxEnergyCost * 0.9
        ? `体力预算接近上限：消耗 ${budget.totalEnergyCost.toFixed(1)}，预算 ${budget.maxEnergyCost}`
        : undefined;

    return { exceeded, budget, warning };
  }
}

