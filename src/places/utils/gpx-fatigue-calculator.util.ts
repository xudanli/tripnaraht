// src/places/utils/gpx-fatigue-calculator.util.ts

import { PhysicalMetadata } from '../interfaces/physical-metadata.interface';

/**
 * GPX 轨迹点
 */
export interface GPXPoint {
  lat: number;
  lng: number;
  elevation?: number;  // 海拔（米）
  time?: Date;         // 时间戳
}

/**
 * GPX 轨迹分析结果
 */
export interface GPXAnalysis {
  /** 总距离（公里） */
  totalDistance: number;
  
  /** 累计爬升高度（米） */
  elevationGain: number;
  
  /** 累计下降高度（米） */
  elevationLoss: number;
  
  /** 最高海拔（米） */
  maxElevation: number;
  
  /** 最低海拔（米） */
  minElevation: number;
  
  /** 平均坡度（%） */
  averageSlope: number;
  
  /** 等效平路距离（公里） */
  equivalentDistance: number;
  
  /** 难度评分（用于 Fatigue 评估） */
  fatigueScore: number;
}

/**
 * GPX 数据到 Fatigue 的转换器
 * 
 * ⚠️ 重要：这个模型用于 Fatigue Track，不是 Difficulty Track
 * 
 * Difficulty = 风险 × 技术 × 不可逆性（不包含距离/爬升）
 * Fatigue = 距离 × 爬升 × 时长（物理消耗）
 * 
 * 这个工具从 GPX 数据中提取 Fatigue 相关指标
 */
export class GPXFatigueCalculator {
  /**
   * 从 GPX 轨迹点计算 Fatigue 相关指标
   * 
   * 数学模型：
   * S_km = D_total + (E_gain / 100)
   * 
   * 其中：
   * - D_total: 总距离（公里）
   * - E_gain: 累计爬升高度（米）
   * - 每 100 米爬升 ≈ 1 公里平路难度
   */
  static analyzeGPX(points: GPXPoint[]): GPXAnalysis {
    if (points.length < 2) {
      throw new Error('GPX 轨迹至少需要 2 个点');
    }

    let totalDistance = 0;  // 总距离（公里）
    let elevationGain = 0;  // 累计爬升（米）
    let elevationLoss = 0;  // 累计下降（米）
    let maxElevation = points[0].elevation || 0;
    let minElevation = points[0].elevation || 0;

    // 遍历轨迹点，计算距离和爬升
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      // 计算两点间距离（使用 Haversine 公式）
      const distance = this.haversineDistance(
        prev.lat, prev.lng,
        curr.lat, curr.lng
      );
      totalDistance += distance;

      // 计算海拔变化
      if (prev.elevation !== undefined && curr.elevation !== undefined) {
        const elevationDiff = curr.elevation - prev.elevation;
        
        if (elevationDiff > 0) {
          elevationGain += elevationDiff;  // 爬升
        } else {
          elevationLoss += Math.abs(elevationDiff);  // 下降
        }

        // 更新最高/最低海拔
        maxElevation = Math.max(maxElevation, curr.elevation);
        minElevation = Math.min(minElevation, curr.elevation);
      }
    }

    // 计算平均坡度（%）
    const averageSlope = totalDistance > 0
      ? (elevationGain / (totalDistance * 1000)) * 100
      : 0;

    // 计算等效平路距离（公里）
    // S_km = D_total + (E_gain / 100)
    const equivalentDistance = totalDistance + (elevationGain / 100);

    // 计算难度评分（用于 Fatigue 评估）
    let fatigueScore = equivalentDistance;

    // 高海拔修正（如果最高海拔 >= 2000m）
    if (maxElevation >= 2000) {
      fatigueScore *= 1.3;  // 高海拔增加 30% 强度
    }

    // 陡坡修正（如果平均坡度 >= 15%）
    if (averageSlope >= 15) {
      // 陡坡提升一个难度等级（相当于增加约 50% 的等效距离）
      fatigueScore *= 1.5;
    }

    return {
      totalDistance,
      elevationGain,
      elevationLoss,
      maxElevation,
      minElevation,
      averageSlope,
      equivalentDistance,
      fatigueScore,
    };
  }

  /**
   * 从 GPX 分析结果生成 PhysicalMetadata
   * 
   * ⚠️ 注意：这只是 Fatigue 评估的一部分
   * 还需要结合其他因素（如 seated_ratio, terrain_type 等）
   */
  static generateFatigueMetadata(analysis: GPXAnalysis): Partial<PhysicalMetadata> {
    // 根据等效距离估算基础疲劳分数
    let baseFatigueScore = 5;  // 默认值
    
    if (analysis.equivalentDistance <= 5) {
      baseFatigueScore = 3;
    } else if (analysis.equivalentDistance <= 10) {
      baseFatigueScore = 5;
    } else if (analysis.equivalentDistance <= 20) {
      baseFatigueScore = 7;
    } else {
      baseFatigueScore = 9;
    }

    // 根据坡度推断地形类型
    let terrainType: PhysicalMetadata['terrain_type'] = 'FLAT';
    if (analysis.averageSlope >= 15) {
      terrainType = 'STAIRS_ONLY';  // 陡坡
    } else if (analysis.averageSlope >= 5) {
      terrainType = 'HILLY';  // 缓坡
    }

    // 根据等效距离估算时长（假设平均速度 4 km/h）
    const estimatedDurationMin = Math.round((analysis.equivalentDistance / 4) * 60);

    // 强度系数（基于疲劳评分）
    const intensityFactor = Math.min(analysis.fatigueScore / 10, 2.5);

    return {
      base_fatigue_score: baseFatigueScore,
      terrain_type: terrainType,
      seated_ratio: 0,  // 徒步路线，不坐着
      intensity_factor: intensityFactor,
      estimated_duration_min: estimatedDurationMin,
    };
  }

  /**
   * 计算两点间的距离（Haversine 公式）
   * 
   * @param lat1 起点纬度
   * @param lng1 起点经度
   * @param lat2 终点纬度
   * @param lng2 终点经度
   * @returns 距离（公里）
   */
  private static haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371;  // 地球半径（公里）
    
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    
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
   * 根据等效距离映射到难度等级（用于 Fatigue 评估）
   * 
   * ⚠️ 注意：这是 Fatigue 的"强度等级"，不是 Difficulty
   * 
   * Difficulty = 风险 × 技术 × 不可逆性
   * Fatigue = 距离 × 爬升 × 时长
   */
  static mapToFatigueLevel(equivalentDistance: number): {
    level: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
    description: string;
  } {
    if (equivalentDistance <= 8) {
      return {
        level: 'LOW',
        description: '低强度：适合所有年龄和体力水平，路线平坦，时长短',
      };
    } else if (equivalentDistance <= 18) {
      return {
        level: 'MODERATE',
        description: '中等强度：需要一定体力，有坡度或中等长度',
      };
    } else if (equivalentDistance <= 30) {
      return {
        level: 'HIGH',
        description: '高强度：对体力有较高要求，涉及长距离、大爬升或陡峭地形',
      };
    } else {
      return {
        level: 'EXTREME',
        description: '极高强度：仅限经验丰富的户外人士，通常是全天行程、高海拔、极端爬升',
      };
    }
  }
}
