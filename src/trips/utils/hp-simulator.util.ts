// src/trips/utils/hp-simulator.util.ts

import { PacingConfig } from '../interfaces/pacing-config.interface';
import { PhysicalMetadata } from '../../places/interfaces/physical-metadata.interface';

/**
 * 路线节点（用于仿真）
 */
export interface RouteNode {
  /** 地点 ID */
  placeId?: number;
  
  /** 地点名称 */
  name: string;
  
  /** 类型 */
  type: 'ACTIVITY' | 'REST' | 'MEAL' | 'TRANSIT';
  
  /** 预估时长（分钟） */
  duration: number;
  
  /** 体力消耗元数据 */
  physicalMetadata?: PhysicalMetadata;
  
  /** 地形类型 */
  terrain?: 'FLAT' | 'HILLY' | 'STAIRS_ONLY' | 'ELEVATOR_AVAILABLE';
  
  /** 位置坐标（用于计算移动距离） */
  location?: { lat: number; lng: number };
}

/**
 * 仿真结果节点
 */
export interface SimulatedNode extends RouteNode {
  /** 当前 HP */
  currentHP: number;
  
  /** 本次消耗的 HP */
  hpCost: number;
  
  /** 是否触发了强制休息 */
  forcedRest?: boolean;
  
  /** 距离上一个节点的移动时间（分钟） */
  transitTime?: number;
}

/**
 * HP 血条仿真器
 * 
 * 核心思想：模拟"电量消耗"，而不是简单按景点数量排程
 * 
 * 仿真循环逻辑：
 * 1. 移动消耗：根据距离和地形计算
 * 2. 游玩消耗：根据时长、坐着比例、地形计算
 * 3. 回血机制：休息/用餐恢复 HP
 * 4. 强制休息：HP 过低或连续活动时间过长时触发
 */
export class HPSimulator {
  /**
   * 仿真路线
   * 
   * @param route 原始路线节点列表
   * @param config 体能配置（木桶效应结果）
   * @returns 仿真后的路线（可能包含自动插入的休息点）
   */
  static simulateRoute(route: RouteNode[], config: PacingConfig): SimulatedNode[] {
    let currentHP = config.max_daily_hp; // 初始 HP = 上限
    let timeSinceLastRest = 0; // 距离上次休息的时间（分钟）
    const finalRoute: SimulatedNode[] = [];
    let previousNode: RouteNode | null = null;

    for (let i = 0; i < route.length; i++) {
      const spot = route[i];
      
      // 1. 计算移动消耗（如果有上一个节点）
      if (previousNode && previousNode.location && spot.location) {
        const transitTime = this.calculateWalkTime(previousNode, spot, config.walk_speed_factor);
        const transitCost = this.calculateTransitCost(transitTime, config);
        
        currentHP -= transitCost;
        timeSinceLastRest += transitTime;
        
        // 记录移动信息
        const transitNode: SimulatedNode = {
          ...spot,
          type: 'TRANSIT',
          duration: transitTime,
          currentHP,
          hpCost: transitCost,
          transitTime,
        };
        finalRoute.push(transitNode);
      }

      // 2. 🚨 触发强制休息机制（濒死检查）
      const shouldRest = this.shouldForceRest(
        currentHP,
        timeSinceLastRest,
        config
      );

      if (shouldRest) {
        const restNode = this.createRestNode(currentHP, config);
        currentHP = Math.min(
          config.max_daily_hp,
          currentHP + restNode.hpRecovery
        );
        timeSinceLastRest = 0; // 重置计时器
        
        finalRoute.push({
          ...restNode,
          currentHP,
          hpCost: 0, // 休息不消耗 HP，反而恢复
          forcedRest: true,
        });
      }

      // 3. 计算游玩消耗
      const activityCost = this.calculateActivityCost(spot, config);
      currentHP = Math.max(0, currentHP - activityCost);
      timeSinceLastRest += spot.duration;

      // 4. 处理回血机制（用餐/休息）
      if (spot.type === 'REST' || spot.type === 'MEAL') {
        const recovery = config.max_daily_hp * config.hp_recovery_rate;
        currentHP = Math.min(config.max_daily_hp, currentHP + recovery);
        timeSinceLastRest = 0;
      }

      // 5. 添加到最终路线
      finalRoute.push({
        ...spot,
        currentHP,
        hpCost: activityCost,
        transitTime: previousNode && previousNode.location && spot.location
          ? this.calculateWalkTime(previousNode, spot, config.walk_speed_factor)
          : undefined,
      });

      previousNode = spot;
    }

    return finalRoute;
  }

  /**
   * 判断是否需要强制休息
   */
  private static shouldForceRest(
    currentHP: number,
    timeSinceLastRest: number,
    config: PacingConfig
  ): boolean {
    // 条件 A: HP 太低
    const minThreshold = config.min_hp_threshold || 20;
    if (currentHP < minThreshold) {
      return true;
    }

    // 条件 B: 连续走路/游玩太久（针对脆皮）
    if (timeSinceLastRest >= config.forced_rest_interval_min) {
      return true;
    }

    return false;
  }

  /**
   * 创建休息节点
   */
  private static createRestNode(
    currentHP: number,
    config: PacingConfig
  ): { name: string; duration: number; type: 'REST'; hpRecovery: number } {
    return {
      name: 'Coffee Break',
      duration: 45, // 休息 45 分钟
      type: 'REST',
      hpRecovery: config.max_daily_hp * config.hp_recovery_rate,
    };
  }

  /**
   * 计算两点之间的步行时间（分钟）
   * 
   * 使用 Haversine 公式计算距离，然后根据步行速度计算时间
   * 
   * @param from 起点
   * @param to 终点
   * @param walkSpeedFactor 步行速度系数（1.0 = 标准 5km/h, 1.5 = 慢 3.3km/h）
   * @returns 步行时间（分钟）
   */
  private static calculateWalkTime(
    from: RouteNode,
    to: RouteNode,
    walkSpeedFactor: number
  ): number {
    if (!from.location || !to.location) {
      return 0; // 没有位置信息，假设不需要移动
    }

    // 使用 Haversine 公式计算距离（公里）
    const distance = this.haversineDistance(
      from.location.lat,
      from.location.lng,
      to.location.lat,
      to.location.lng
    );

    // 标准步行速度：5 km/h = 0.083 km/min
    // 考虑速度系数：walkSpeedFactor = 1.5 表示慢 1.5 倍
    const baseSpeed = 0.083; // km/min
    const actualSpeed = baseSpeed / walkSpeedFactor;

    // 时间 = 距离 / 速度
    const timeMinutes = distance / actualSpeed;

    return Math.ceil(timeMinutes); // 向上取整
  }

  /**
   * 使用 Haversine 公式计算两点间距离（公里）
   */
  private static haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance;
  }

  /**
   * 角度转弧度
   */
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 计算移动消耗（HP）
   * 
   * 公式：Cost = 时间(分) × 0.5 × 地形系数
   * - 平路: 系数 1.0
   * - 爬坡: 系数 3.0（如果是"银发徒步"，系数 5.0）
   * 
   * @param transitTime 移动时间（分钟）
   * @param config 体能配置
   * @returns 消耗的 HP
   */
  private static calculateTransitCost(
    transitTime: number,
    config: PacingConfig
  ): number {
    // 基础消耗：每分钟 0.5 HP
    const baseCost = transitTime * 0.5;
    
    // 地形系数（这里简化处理，实际应该根据路线地形判断）
    // 如果团队有地形限制，移动消耗会增加
    let terrainFactor = 1.0;
    if (config.terrain_filter === 'NO_STAIRS' || config.terrain_filter === 'WHEELCHAIR_ONLY') {
      terrainFactor = 1.5; // 有地形限制时，移动更累
    }
    
    return baseCost * terrainFactor;
  }

  /**
   * 计算活动消耗（HP）
   * 
   * 公式：Cost = 时长(分) × (1 - 坐着的时间比例) × 强度系数 × 基础消耗
   * 
   * - 剧院: 坐着比例 1.0 → 消耗极低
   * - 逛街: 坐着比例 0.0 → 消耗高
   * - 如果该景点需要爬楼梯，且团队里有膝盖不好的，消耗 × stairs_penalty_factor
   * 
   * @param spot 活动节点
   * @param config 体能配置
   * @returns 消耗的 HP
   */
  private static calculateActivityCost(
    spot: RouteNode,
    config: PacingConfig
  ): number {
    // 获取基础消耗分数（每10分钟消耗多少HP，默认 5）
    const baseFatigueScore = spot.physicalMetadata?.base_fatigue_score || 5;
    const baseCostPer10Min = baseFatigueScore;
    
    // 计算基础消耗
    const duration10Min = spot.duration / 10;
    let cost = duration10Min * baseCostPer10Min;
    
    // 考虑坐着的时间比例
    const seatedRatio = spot.physicalMetadata?.seated_ratio || 0;
    cost = cost * (1 - seatedRatio);
    
    // 考虑强度系数
    const intensityFactor = spot.physicalMetadata?.intensity_factor || 1.0;
    cost = cost * intensityFactor;
    
    // 如果该景点需要爬楼梯，且团队不能爬楼
    const terrain = spot.terrain || spot.physicalMetadata?.terrain_type;
    if (terrain === 'STAIRS_ONLY' && config.stairs_penalty_factor >= 999) {
      // 不能爬楼，消耗无限大（实际应该跳过这个景点）
      return 9999;
    } else if (terrain === 'STAIRS_ONLY' || terrain === 'HILLY') {
      // 爬楼/爬坡惩罚
      cost = cost * config.stairs_penalty_factor;
    }
    
    return Math.ceil(cost);
  }
}

