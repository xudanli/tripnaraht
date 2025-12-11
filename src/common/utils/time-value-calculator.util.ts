// src/common/utils/time-value-calculator.util.ts

/**
 * 时间价值计算工具类
 * 
 * 根据用户画像、预算、行程特征等因素动态计算时间价值
 * 
 * 时间价值（元/小时）的计算因素：
 * 1. 预算水平（总预算 / 行程天数 / 人数）
 * 2. 旅行者类型（成年人、老人、儿童）
 * 3. 行程密度（高密度行程时间价值更高）
 * 4. 时间敏感度（商务旅行 vs 休闲旅行）
 */

export interface TimeValueCalculationContext {
  /** 总预算（元） */
  totalBudget?: number;
  
  /** 行程天数 */
  tripDays?: number;
  
  /** 旅行者人数 */
  travelerCount?: number;
  
  /** 旅行者类型分布 */
  travelers?: Array<{
    type: 'ADULT' | 'ELDERLY' | 'CHILD';
    mobilityTag?: string;
  }>;
  
  /** 行程密度（每天平均景点数） */
  avgPlacesPerDay?: number;
  
  /** 时间敏感度 */
  timeSensitivity?: 'HIGH' | 'MEDIUM' | 'LOW';
  
  /** 旅行类型 */
  tripType?: 'BUSINESS' | 'LEISURE' | 'FAMILY' | 'BACKPACKING';
}

export class TimeValueCalculator {
  /**
   * 计算时间价值（元/小时）
   * 
   * @param context 计算上下文
   * @returns 时间价值（元/小时）
   */
  static calculateTimeValue(context: TimeValueCalculationContext): number {
    // 1. 基础时间价值（根据预算水平）
    const baseValue = this.calculateBaseValue(context);
    
    // 2. 旅行者类型调整
    const travelerMultiplier = this.getTravelerMultiplier(context.travelers);
    
    // 3. 行程密度调整
    const densityMultiplier = this.getDensityMultiplier(context.avgPlacesPerDay);
    
    // 4. 时间敏感度调整
    const sensitivityMultiplier = this.getSensitivityMultiplier(context.timeSensitivity);
    
    // 5. 旅行类型调整
    const tripTypeMultiplier = this.getTripTypeMultiplier(context.tripType);
    
    // 计算最终时间价值
    const timeValue = baseValue * travelerMultiplier * densityMultiplier * sensitivityMultiplier * tripTypeMultiplier;
    
    // 限制范围：20-200 元/小时
    return Math.max(20, Math.min(200, Math.round(timeValue * 10) / 10));
  }

  /**
   * 计算基础时间价值（根据预算水平）
   * 
   * 公式：日均预算 / 8小时 / 人数
   * 
   * 如果无法计算，使用默认值 50元/小时
   */
  private static calculateBaseValue(context: TimeValueCalculationContext): number {
    if (!context.totalBudget || !context.tripDays || !context.travelerCount) {
      return 50; // 默认值
    }

    const dailyBudget = context.totalBudget / context.tripDays;
    const perPersonDailyBudget = dailyBudget / context.travelerCount;
    
    // 假设每天有8小时可用于活动
    // 时间价值 = 人均日预算 / 8小时
    const baseValue = perPersonDailyBudget / 8;
    
    // 如果计算结果过低（< 20）或过高（> 200），使用默认值
    if (baseValue < 20 || baseValue > 200) {
      return 50;
    }
    
    return baseValue;
  }

  /**
   * 旅行者类型调整因子
   * 
   * - 成年人：1.0（基准）
   * - 老人：0.8（时间价值较低，更愿意花时间）
   * - 儿童：0.6（时间价值最低）
   */
  private static getTravelerMultiplier(
    travelers?: Array<{ type: 'ADULT' | 'ELDERLY' | 'CHILD' }>
  ): number {
    if (!travelers || travelers.length === 0) {
      return 1.0;
    }

    // 计算加权平均
    let totalWeight = 0;
    let weightedSum = 0;

    for (const traveler of travelers) {
      let weight = 1.0;
      switch (traveler.type) {
        case 'ADULT':
          weight = 1.0;
          break;
        case 'ELDERLY':
          weight = 0.8;
          break;
        case 'CHILD':
          weight = 0.6;
          break;
      }
      totalWeight += weight;
      weightedSum += weight * weight; // 使用平方权重，让成年人占比更高
    }

    // 如果全是成年人，返回1.0
    if (totalWeight === travelers.length) {
      return 1.0;
    }

    // 计算平均调整因子
    const avgMultiplier = weightedSum / totalWeight;
    return Math.max(0.6, Math.min(1.0, avgMultiplier));
  }

  /**
   * 行程密度调整因子
   * 
   * - 高密度（≥4个/天）：1.3（时间价值高，时间宝贵）
   * - 中密度（2-3个/天）：1.0（基准）
   * - 低密度（≤1个/天）：0.7（时间价值低，可以慢慢来）
   */
  private static getDensityMultiplier(avgPlacesPerDay?: number): number {
    if (!avgPlacesPerDay || avgPlacesPerDay === 0) {
      return 1.0; // 默认基准
    }

    if (avgPlacesPerDay >= 4) {
      return 1.3; // 高密度：时间价值高
    } else if (avgPlacesPerDay >= 2) {
      return 1.0; // 中密度：基准
    } else {
      return 0.7; // 低密度：时间价值低
    }
  }

  /**
   * 时间敏感度调整因子
   * 
   * - HIGH：1.5（时间价值高）
   * - MEDIUM：1.0（基准）
   * - LOW：0.7（时间价值低）
   */
  private static getSensitivityMultiplier(
    timeSensitivity?: 'HIGH' | 'MEDIUM' | 'LOW'
  ): number {
    switch (timeSensitivity) {
      case 'HIGH':
        return 1.5;
      case 'LOW':
        return 0.7;
      case 'MEDIUM':
      default:
        return 1.0;
    }
  }

  /**
   * 旅行类型调整因子
   * 
   * - BUSINESS：1.4（商务旅行，时间价值高）
   * - LEISURE：1.0（休闲旅行，基准）
   * - FAMILY：0.8（家庭旅行，时间价值较低）
   * - BACKPACKING：0.6（背包客，时间价值最低）
   */
  private static getTripTypeMultiplier(
    tripType?: 'BUSINESS' | 'LEISURE' | 'FAMILY' | 'BACKPACKING'
  ): number {
    switch (tripType) {
      case 'BUSINESS':
        return 1.4;
      case 'FAMILY':
        return 0.8;
      case 'BACKPACKING':
        return 0.6;
      case 'LEISURE':
      default:
        return 1.0;
    }
  }

  /**
   * 从行程信息计算时间价值
   * 
   * 如果提供了 tripId，会从行程中提取相关信息
   * 
   * @param tripId 行程 ID
   * @param prisma PrismaService 实例
   */
  static async calculateFromTrip(
    tripId: string,
    prisma: { trip: { findUnique: (args: any) => Promise<any> } }
  ): Promise<number> {
    // 获取行程信息
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        days: {
          include: {
            items: {
              include: {
                place: {
                  where: {
                    category: 'ATTRACTION',
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!trip) {
      return 50; // 默认值
    }

    // 计算行程天数
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    const tripDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // 计算行程密度
    const seenAttractionIds = new Set<number>();
    for (const day of trip.days) {
      for (const item of day.items) {
        if (item.place && item.place.category === 'ATTRACTION') {
          seenAttractionIds.add(item.place.id);
        }
      }
    }
    const totalAttractions = seenAttractionIds.size;
    const avgPlacesPerDay = tripDays > 0 ? totalAttractions / tripDays : 0;

    // 从预算配置中提取信息
    const budgetConfig = trip.budgetConfig as any;
    // 兼容 total 和 totalBudget 两种字段名
    const totalBudget = budgetConfig?.totalBudget || budgetConfig?.total;
    const travelers = budgetConfig?.travelers || [];

    // 构建计算上下文
    const context: TimeValueCalculationContext = {
      totalBudget,
      tripDays,
      travelerCount: travelers.length,
      travelers: travelers.map((t: any) => ({
        type: t.type,
        mobilityTag: t.mobilityTag,
      })),
      avgPlacesPerDay,
      timeSensitivity: this.inferTimeSensitivity(avgPlacesPerDay, budgetConfig),
      tripType: this.inferTripType(budgetConfig),
    };

    return this.calculateTimeValue(context);
  }

  /**
   * 推断时间敏感度
   */
  private static inferTimeSensitivity(
    avgPlacesPerDay: number,
    budgetConfig?: any
  ): 'HIGH' | 'MEDIUM' | 'LOW' {
    // 根据行程密度推断
    if (avgPlacesPerDay >= 4) {
      return 'HIGH';
    } else if (avgPlacesPerDay >= 2) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * 推断旅行类型
   */
  private static inferTripType(budgetConfig?: any): 'BUSINESS' | 'LEISURE' | 'FAMILY' | 'BACKPACKING' {
    // 可以根据预算、旅行者类型等推断
    // 这里简化处理，默认返回 LEISURE
    return 'LEISURE';
  }
}
