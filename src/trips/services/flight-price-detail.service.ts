// src/trips/services/flight-price-detail.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 国内航线价格详细服务
 * 
 * 基于2024年历史数据计算的价格估算
 * 使用公式：预算价格 = P_month × F_day
 */
@Injectable()
export class FlightPriceDetailService {
  private readonly logger = new Logger(FlightPriceDetailService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 估算国内航线价格
   * 
   * @param originCity 出发城市，如 "成都"
   * @param destinationCity 到达城市，如 "深圳"
   * @param month 月份（1-12）
   * @param dayOfWeek 星期几（0=周一, 6=周日，可选）
   * @returns 估算价格和价格范围
   */
  async estimateDomesticPrice(
    originCity: string,
    destinationCity: string,
    month: number,
    dayOfWeek?: number
  ): Promise<{
    estimatedPrice: number;
    lowerBound: number;
    upperBound: number;
    monthlyBasePrice: number;
    dayOfWeekFactor?: number;
    sampleCount: number;
  }> {
    const routeId = `${originCity}->${destinationCity}`;

    // 1. 查找月度基准价
    const monthlyData = await this.prisma.flightPriceDetail.findFirst({
      where: {
        routeId,
        month,
        dayOfWeek: null, // 汇总数据
      },
    });

    if (!monthlyData) {
      this.logger.warn(
        `未找到航线 ${routeId} 在 ${month} 月的数据，使用默认值`
      );
      return {
        estimatedPrice: 2000,
        lowerBound: 1800,
        upperBound: 2200,
        monthlyBasePrice: 2000,
        sampleCount: 0,
      };
    }

    // 2. 如果指定了星期几，查找周内因子
    let dayOfWeekFactor: number | undefined;
    if (dayOfWeek !== undefined) {
      const dayData = await this.prisma.flightPriceDetail.findFirst({
        where: {
          routeId,
          month,
          dayOfWeek,
        },
      });

      if (dayData && dayData.dayOfWeekFactor) {
        dayOfWeekFactor = dayData.dayOfWeekFactor;
      } else {
        // 降级：使用全局周内因子
        const globalFactor = await this.prisma.dayOfWeekFactor.findUnique({
          where: { dayOfWeek },
        });
        dayOfWeekFactor = globalFactor?.factor || 1.0;
      }
    }

    // 3. 计算估算价格
    // 公式：预算价格 = P_month × F_day
    const estimatedPrice = dayOfWeekFactor
      ? Math.round(monthlyData.monthlyBasePrice * dayOfWeekFactor)
      : Math.round(monthlyData.monthlyBasePrice);

    // 4. 计算价格范围（±10%）
    const lowerBound = Math.round(estimatedPrice * 0.9);
    const upperBound = Math.round(estimatedPrice * 1.1);

    return {
      estimatedPrice,
      lowerBound,
      upperBound,
      monthlyBasePrice: monthlyData.monthlyBasePrice,
      dayOfWeekFactor,
      sampleCount: monthlyData.sampleCount,
    };
  }

  /**
   * 获取周内因子（全局）
   */
  async getDayOfWeekFactor(dayOfWeek: number): Promise<number> {
    const factor = await this.prisma.dayOfWeekFactor.findUnique({
      where: { dayOfWeek },
    });

    return factor?.factor || 1.0;
  }

  /**
   * 获取所有周内因子
   */
  async getAllDayOfWeekFactors() {
    return this.prisma.dayOfWeekFactor.findMany({
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  /**
   * 获取航线的月度价格趋势
   */
  async getMonthlyTrend(
    originCity: string,
    destinationCity: string
  ): Promise<Array<{ month: number; basePrice: number; sampleCount: number }>> {
    const routeId = `${originCity}->${destinationCity}`;

    const data = await this.prisma.flightPriceDetail.findMany({
      where: {
        routeId,
        dayOfWeek: null, // 只取汇总数据
      },
      orderBy: { month: 'asc' },
    });

    return data.map((d) => ({
      month: d.month,
      basePrice: d.monthlyBasePrice,
      sampleCount: d.sampleCount,
    }));
  }
}

