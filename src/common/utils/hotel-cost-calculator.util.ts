// src/common/utils/hotel-cost-calculator.util.ts

/**
 * 酒店综合成本计算工具类
 * 
 * 核心思想：把"距离"折算成"钱"，帮助用户看到隐形成本
 * 
 * 公式：
 * 综合成本 = 房价 + (交通费 × 2) + (通勤时间 × 时间价值)
 * 
 * 其中：
 * - 交通费 × 2：往返费用
 * - 通勤时间：单程时间（小时）
 * - 时间价值：用户每小时的时间值多少钱（默认 50元/小时）
 */
export class HotelCostCalculator {
  /**
   * 计算综合成本
   * 
   * @param roomRate 每晚房价（元）
   * @param transportCost 单程交通费（元）
   * @param commuteTimeMinutes 单程通勤时间（分钟）
   * @param timeValuePerHour 时间价值（元/小时），默认 50
   * @returns 综合成本（元）
   */
  static calculateTotalCost(
    roomRate: number,
    transportCost: number,
    commuteTimeMinutes: number,
    timeValuePerHour: number = 50
  ): number {
    // 往返交通费
    const roundTripTransportCost = transportCost * 2;
    
    // 时间成本（转换为小时）
    const commuteTimeHours = commuteTimeMinutes / 60;
    const timeCost = commuteTimeHours * timeValuePerHour;
    
    // 综合成本
    const totalCost = roomRate + roundTripTransportCost + timeCost;
    
    return Math.round(totalCost * 100) / 100; // 保留两位小数
  }

  /**
   * 计算并返回详细的成本分解
   * 
   * @param roomRate 每晚房价（元）
   * @param transportCost 单程交通费（元）
   * @param commuteTimeMinutes 单程通勤时间（分钟）
   * @param timeValuePerHour 时间价值（元/小时），默认 50
   * @returns 成本分解对象
   */
  static calculateCostBreakdown(
    roomRate: number,
    transportCost: number,
    commuteTimeMinutes: number,
    timeValuePerHour: number = 50
  ): {
    roomRate: number;
    transportCost: number;
    roundTripTransportCost: number;
    timeCost: number;
    totalCost: number;
    hiddenCost: number; // 隐形成本（交通费 + 时间成本）
  } {
    const roundTripTransportCost = transportCost * 2;
    const commuteTimeHours = commuteTimeMinutes / 60;
    const timeCost = commuteTimeHours * timeValuePerHour;
    const hiddenCost = roundTripTransportCost + timeCost;
    const totalCost = roomRate + hiddenCost;

    return {
      roomRate: Math.round(roomRate * 100) / 100,
      transportCost: Math.round(transportCost * 100) / 100,
      roundTripTransportCost: Math.round(roundTripTransportCost * 100) / 100,
      timeCost: Math.round(timeCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      hiddenCost: Math.round(hiddenCost * 100) / 100,
    };
  }

  /**
   * 估算交通费（基于距离）
   * 
   * 根据距离估算单程交通费
   * - 0-2km：步行/短途地铁，10-20元
   * - 2-5km：地铁/公交，20-40元
   * - 5-10km：地铁/打车，40-80元
   * - 10km+：打车/长途，80-150元
   * 
   * @param distanceKm 距离（公里）
   * @param useTaxi 是否使用打车（默认 false，使用公共交通）
   * @returns 估算的交通费（元）
   */
  static estimateTransportCost(distanceKm: number, useTaxi: boolean = false): number {
    if (useTaxi) {
      // 打车费用：起步价 + 里程费
      const baseFare = 15; // 起步价
      const perKmFare = 3; // 每公里费用
      return baseFare + distanceKm * perKmFare;
    } else {
      // 公共交通费用（简化估算）
      if (distanceKm <= 2) {
        return 10 + (distanceKm * 5); // 10-20元
      } else if (distanceKm <= 5) {
        return 20 + ((distanceKm - 2) * 7); // 20-41元
      } else if (distanceKm <= 10) {
        return 40 + ((distanceKm - 5) * 8); // 40-80元
      } else {
        return 80 + ((distanceKm - 10) * 5); // 80-130元
      }
    }
  }

  /**
   * 估算通勤时间（基于距离和交通方式）
   * 
   * @param distanceKm 距离（公里）
   * @param transportMode 交通方式：'walk' | 'metro' | 'taxi' | 'bus'
   * @returns 估算的通勤时间（分钟）
   */
  static estimateCommuteTime(
    distanceKm: number,
    transportMode: 'walk' | 'metro' | 'taxi' | 'bus' = 'metro'
  ): number {
    switch (transportMode) {
      case 'walk':
        // 步行速度：5 km/h
        return (distanceKm / 5) * 60;
      
      case 'metro':
        // 地铁：平均速度 30 km/h（包含等车、换乘时间）
        return (distanceKm / 30) * 60;
      
      case 'taxi':
        // 打车：平均速度 25 km/h（考虑堵车）
        return (distanceKm / 25) * 60;
      
      case 'bus':
        // 公交：平均速度 20 km/h（考虑停站、堵车）
        return (distanceKm / 20) * 60;
      
      default:
        return (distanceKm / 30) * 60; // 默认地铁
    }
  }
}

