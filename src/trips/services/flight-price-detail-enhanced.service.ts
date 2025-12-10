// src/trips/services/flight-price-detail-enhanced.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * 国内航线价格详细服务（增强版）
 * 
 * 提供不同航空公司、不同起飞时间的详细价格选项
 */
@Injectable()
export class FlightPriceDetailEnhancedService {
  private readonly logger = new Logger(FlightPriceDetailEnhancedService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 获取不同航空公司和不同起飞时间的详细价格选项
   * 
   * @param originCity 出发城市
   * @param destinationCity 到达城市
   * @param month 月份（1-12）
   * @param dayOfWeek 星期几（0=周一, 6=周日，可选）
   * @returns 按航空公司和起飞时间段分组的价格选项列表
   */
  async getDetailedPriceOptions(
    originCity: string,
    destinationCity: string,
    month: number,
    dayOfWeek?: number
  ): Promise<{
    airlines: Array<{
      airline: string;
      avgPrice: number;
      minPrice: number;
      maxPrice: number;
      sampleCount: number;
      departureTimes: Array<{
        timeSlot: string;
        avgPrice: number;
        sampleCount: number;
      }>;
    }>;
    timeSlots: Array<{
      timeSlot: string;
      avgPrice: number;
      minPrice: number;
      maxPrice: number;
      sampleCount: number;
      airlines: string[];
    }>;
  }> {
    this.logger.debug(`查询详细价格选项: ${originCity}->${destinationCity}, 月份: ${month}, 星期: ${dayOfWeek}`);

    // 构建SQL查询条件
    let dayOfWeekCondition = '';
    if (dayOfWeek !== undefined) {
      // PostgreSQL的DOW: 0=周日, 1=周一, ..., 6=周六
      // 我们的dayOfWeek: 0=周一, 6=周日
      const pgDow = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
      dayOfWeekCondition = `AND EXTRACT(DOW FROM "日期") = ${pgDow}`;
    }

    // 查询不同航空公司的价格统计
    const airlineStats = await this.prisma.$queryRaw<Array<{
      airline: string;
      avg_price: number;
      min_price: number;
      max_price: number;
      sample_count: bigint;
    }>>`
      SELECT 
        "航空公司" as airline,
        AVG("价格元")::FLOAT as avg_price,
        MIN("价格元")::FLOAT as min_price,
        MAX("价格元")::FLOAT as max_price,
        COUNT(*)::BIGINT as sample_count
      FROM "RawFlightData"
      WHERE 
        "出发城市" = ${originCity}
        AND "到达城市" = ${destinationCity}
        AND EXTRACT(MONTH FROM "日期") = ${month}
        AND "价格元" > 0 
        AND "价格元" < 100000
        AND "航空公司" IS NOT NULL 
        AND "航空公司" != ''
        ${dayOfWeekCondition ? Prisma.raw(dayOfWeekCondition) : Prisma.empty}
      GROUP BY "航空公司"
      ORDER BY avg_price ASC
    `;

    // 查询每个航空公司的起飞时间段分布
    const airlineTimeSlots = await Promise.all(
      airlineStats.map(async (airline) => {
        const timeSlots = await this.prisma.$queryRaw<Array<{
          time_slot: string;
          avg_price: number;
          sample_count: bigint;
        }>>`
          SELECT 
            CASE 
              WHEN EXTRACT(HOUR FROM "起飞时间"::TIME) >= 0 AND EXTRACT(HOUR FROM "起飞时间"::TIME) < 6 THEN '00:00-06:00'
              WHEN EXTRACT(HOUR FROM "起飞时间"::TIME) >= 6 AND EXTRACT(HOUR FROM "起飞时间"::TIME) < 12 THEN '06:00-12:00'
              WHEN EXTRACT(HOUR FROM "起飞时间"::TIME) >= 12 AND EXTRACT(HOUR FROM "起飞时间"::TIME) < 18 THEN '12:00-18:00'
              ELSE '18:00-24:00'
            END as time_slot,
            AVG("价格元")::FLOAT as avg_price,
            COUNT(*)::BIGINT as sample_count
          FROM "RawFlightData"
          WHERE 
            "出发城市" = ${originCity}
            AND "到达城市" = ${destinationCity}
            AND EXTRACT(MONTH FROM "日期") = ${month}
            AND "航空公司" = ${airline.airline}
            AND "价格元" > 0 
            AND "价格元" < 100000
            AND "起飞时间" IS NOT NULL
            ${dayOfWeekCondition ? Prisma.raw(dayOfWeekCondition) : Prisma.empty}
          GROUP BY time_slot
          ORDER BY avg_price ASC
        `;

        return {
          airline: airline.airline,
          avgPrice: Math.round(airline.avg_price),
          minPrice: Math.round(airline.min_price),
          maxPrice: Math.round(airline.max_price),
          sampleCount: Number(airline.sample_count),
          departureTimes: timeSlots.map(ts => ({
            timeSlot: ts.time_slot,
            avgPrice: Math.round(ts.avg_price),
            sampleCount: Number(ts.sample_count),
          })),
        };
      })
    );

    // 查询不同起飞时间段的价格统计
    const timeSlotStats = await this.prisma.$queryRaw<Array<{
      time_slot: string;
      avg_price: number;
      min_price: number;
      max_price: number;
      sample_count: bigint;
      airlines: string;
    }>>`
      SELECT 
        CASE 
          WHEN EXTRACT(HOUR FROM "起飞时间"::TIME) >= 0 AND EXTRACT(HOUR FROM "起飞时间"::TIME) < 6 THEN '00:00-06:00'
          WHEN EXTRACT(HOUR FROM "起飞时间"::TIME) >= 6 AND EXTRACT(HOUR FROM "起飞时间"::TIME) < 12 THEN '06:00-12:00'
          WHEN EXTRACT(HOUR FROM "起飞时间"::TIME) >= 12 AND EXTRACT(HOUR FROM "起飞时间"::TIME) < 18 THEN '12:00-18:00'
          ELSE '18:00-24:00'
        END as time_slot,
        AVG("价格元")::FLOAT as avg_price,
        MIN("价格元")::FLOAT as min_price,
        MAX("价格元")::FLOAT as max_price,
        COUNT(*)::BIGINT as sample_count,
        STRING_AGG(DISTINCT "航空公司", ', ' ORDER BY "航空公司") as airlines
      FROM "RawFlightData"
      WHERE 
        "出发城市" = ${originCity}
        AND "到达城市" = ${destinationCity}
        AND EXTRACT(MONTH FROM "日期") = ${month}
        AND "价格元" > 0 
        AND "价格元" < 100000
        AND "起飞时间" IS NOT NULL
        ${dayOfWeekCondition ? Prisma.raw(dayOfWeekCondition) : Prisma.empty}
      GROUP BY time_slot
      ORDER BY avg_price ASC
    `;

    return {
      airlines: airlineTimeSlots,
      timeSlots: timeSlotStats.map(ts => ({
        timeSlot: ts.time_slot,
        avgPrice: Math.round(ts.avg_price),
        minPrice: Math.round(ts.min_price),
        maxPrice: Math.round(ts.max_price),
        sampleCount: Number(ts.sample_count),
        airlines: ts.airlines ? ts.airlines.split(', ') : [],
      })),
    };
  }
}
