// src/trips/services/flight-price-detail.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 国内航线价格详细服务
 * 
 * 基于2023-2024年历史数据计算的价格估算
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
    distanceKm?: number | null;
    monthFactor?: number | null;
    airlineCount?: number | null;
    isWeekend?: boolean | null;
    departureTime?: string | null;
    arrivalTime?: string | null;
    timeOfDayFactor?: number | null;
  }> {
    const routeId = `${originCity}->${destinationCity}`;
    this.logger.debug(`查询航线: ${routeId}, 月份: ${month}, 星期: ${dayOfWeek}`);
    this.logger.debug(`routeId 长度: ${routeId.length}, 编码: ${Buffer.from(routeId).toString('hex')}`);

    // 如果指定了星期几，直接查询对应的数据
    if (dayOfWeek !== undefined) {
      const dayData = await this.prisma.flightPriceDetail.findFirst({
        where: {
          routeId,
          month,
          dayOfWeek,
        },
        select: {
          id: true,
          routeId: true,
          originCity: true,
          destinationCity: true,
          month: true,
          dayOfWeek: true,
          monthlyBasePrice: true,
          dayOfWeekFactor: true,
          sampleCount: true,
          distanceKm: true,
          monthFactor: true,
          airlineCount: true,
          isWeekend: true,
          departureTime: true,
          arrivalTime: true,
          timeOfDayFactor: true,
        },
      });

      this.logger.debug(`查询结果: ${dayData ? `找到数据 (ID: ${dayData.id}, 基准价: ${dayData.monthlyBasePrice})` : '未找到数据'}`);
      
      // 如果没找到，尝试查询该月份的所有数据看看是否存在
      if (!dayData) {
        const allMonthData = await this.prisma.flightPriceDetail.findMany({
          where: {
            routeId,
            month,
          },
        });
        this.logger.debug(`该月份所有数据数量: ${allMonthData.length}`);
        if (allMonthData.length > 0) {
          // 显示所有可用的 dayOfWeek 值
          const availableDayOfWeeks = allMonthData
            .map(d => d.dayOfWeek)
            .filter((dow): dow is number => dow !== null)
            .sort((a, b) => a - b);
          const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
          const dayOfWeekNames = availableDayOfWeeks.map(dow => `${dow}(${dayNames[dow]})`).join(', ');
          this.logger.debug(`可用的星期值: [${dayOfWeekNames}] (请求的是: ${dayOfWeek}(${dayNames[dayOfWeek] || '未知'}))`);
        }
      }

      if (dayData) {
        // 使用该星期几的数据
        const dayOfWeekFactor = dayData.dayOfWeekFactor || 1.0;
        const estimatedPrice = Math.round(dayData.monthlyBasePrice * dayOfWeekFactor);
        const lowerBound = Math.round(estimatedPrice * 0.9);
        const upperBound = Math.round(estimatedPrice * 1.1);

        return {
          estimatedPrice,
          lowerBound,
          upperBound,
          monthlyBasePrice: dayData.monthlyBasePrice,
          dayOfWeekFactor,
          sampleCount: dayData.sampleCount,
          distanceKm: dayData.distanceKm,
          monthFactor: dayData.monthFactor,
          airlineCount: dayData.airlineCount,
          isWeekend: dayData.isWeekend,
          departureTime: dayData.departureTime,
          arrivalTime: dayData.arrivalTime,
          timeOfDayFactor: dayData.timeOfDayFactor,
        };
      } else {
        // 如果没找到具体星期几的数据，降级到月度平均值
        this.logger.warn(
          `未找到航线 ${routeId} 在 ${month} 月 ${dayOfWeek} 的数据，使用月度平均值`
        );
      }
    }

    // 1. 查找月度基准价（计算该月份所有星期的平均值）
    const monthlyDataList = await this.prisma.flightPriceDetail.findMany({
      where: {
        routeId,
        month,
      },
      select: {
        id: true,
        routeId: true,
        originCity: true,
        destinationCity: true,
        month: true,
        dayOfWeek: true,
        monthlyBasePrice: true,
        dayOfWeekFactor: true,
        sampleCount: true,
        distanceKm: true,
        monthFactor: true,
        airlineCount: true,
        isWeekend: true,
        departureTime: true,
        arrivalTime: true,
        timeOfDayFactor: true,
      },
    });

    if (monthlyDataList.length === 0) {
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

    // 计算月度平均基准价（加权平均，按样本数）
    const totalSamples = monthlyDataList.reduce((sum, d) => sum + d.sampleCount, 0);
    const weightedPrice = monthlyDataList.reduce(
      (sum, d) => sum + d.monthlyBasePrice * d.sampleCount,
      0
    ) / totalSamples;

    const monthlyBasePrice = Math.round(weightedPrice);

    // 2. 如果指定了星期几，使用全局周内因子
    let dayOfWeekFactor: number | undefined;
    if (dayOfWeek !== undefined) {
      const globalFactor = await this.prisma.dayOfWeekFactor.findUnique({
        where: { dayOfWeek },
      });
      dayOfWeekFactor = globalFactor?.factor || 1.0;
    }

    // 3. 计算估算价格
    // 公式：预算价格 = P_month × F_day
    const estimatedPrice = dayOfWeekFactor
      ? Math.round(monthlyBasePrice * dayOfWeekFactor)
      : monthlyBasePrice;

    // 4. 计算价格范围（±10%）
    const lowerBound = Math.round(estimatedPrice * 0.9);
    const upperBound = Math.round(estimatedPrice * 1.1);

    // 获取第一条记录的新字段（用于返回）
    const firstRecord = monthlyDataList[0];

    return {
      estimatedPrice,
      lowerBound,
      upperBound,
      monthlyBasePrice,
      dayOfWeekFactor,
      sampleCount: totalSamples,
      distanceKm: firstRecord.distanceKm,
      monthFactor: firstRecord.monthFactor,
      airlineCount: firstRecord.airlineCount,
      isWeekend: firstRecord.isWeekend,
      departureTime: firstRecord.departureTime,
      arrivalTime: firstRecord.arrivalTime,
      timeOfDayFactor: firstRecord.timeOfDayFactor,
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

    // 查询该航线的所有数据，按月份分组计算平均值
    const allData = await this.prisma.flightPriceDetail.findMany({
      where: {
        routeId,
      },
    });

    if (allData.length === 0) {
      return [];
    }

    // 按月份分组，计算加权平均价格
    const monthlyMap = new Map<number, { totalPrice: number; totalSamples: number }>();

    allData.forEach((d) => {
      const existing = monthlyMap.get(d.month);
      if (existing) {
        existing.totalPrice += d.monthlyBasePrice * d.sampleCount;
        existing.totalSamples += d.sampleCount;
      } else {
        monthlyMap.set(d.month, {
          totalPrice: d.monthlyBasePrice * d.sampleCount,
          totalSamples: d.sampleCount,
        });
      }
    });

    // 转换为数组并按月份排序
    const result = Array.from(monthlyMap.entries())
      .map(([month, stats]) => ({
        month,
        basePrice: Math.round(stats.totalPrice / stats.totalSamples),
        sampleCount: stats.totalSamples,
      }))
      .sort((a, b) => a.month - b.month);

    return result;
  }
}

