// src/hotels/services/hotel-price-prediction.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  HotelPricePredictionRequest,
  HotelPricePredictionResponse,
  PriceForecast,
  BuySignal,
  HistoricalTrend,
} from '../../flight-prices/interfaces/price-prediction.interface';
import { ProphetService } from '../../flight-prices/services/prophet-service';

/**
 * 酒店价格预测服务
 * 
 * 使用 Prophet 模型（或历史同期均值法）进行价格趋势预测
 */
@Injectable()
export class HotelPricePredictionService {
  private readonly logger = new Logger(HotelPricePredictionService.name);

  constructor(
    private prisma: PrismaService,
    private prophetService: ProphetService
  ) {}

  /**
   * 预测酒店价格
   */
  async predictHotelPrice(
    request: HotelPricePredictionRequest
  ): Promise<HotelPricePredictionResponse> {
    this.logger.debug(
      `预测酒店价格: ${request.city}, ${request.star_level}星, 日期: ${request.check_in_date}`
    );

    // 1. 获取当前价格（如果有）
    const currentPrice = await this.getCurrentHotelPrice(
      request.city,
      request.star_level,
      request.check_in_date
    );

    // 2. 获取历史价格数据
    const historicalData = await this.getHistoricalHotelPrices(
      request.city,
      request.star_level
    );

    // 3. 计算历史趋势
    const historicalTrend = this.calculateHistoricalTrend(historicalData);

    // 4. 生成价格预测（未来30天）
    const forecast = await this.generateForecast(
      historicalData,
      request.check_in_date,
      30
    );

    // 5. 生成买入信号
    const buySignal = this.generateBuySignal(
      currentPrice || forecast[0]?.price || historicalTrend.mean_price,
      historicalTrend.mean_price,
      forecast[0]?.price || historicalTrend.mean_price
    );

    return {
      current_price: currentPrice || forecast[0]?.price || historicalTrend.mean_price,
      buy_signal: buySignal,
      forecast,
      historical_trend: historicalTrend,
    };
  }

  /**
   * 获取当前酒店价格
   * 
   * 优先从实时价格API获取，如果不可用则从数据库查询最新价格
   */
  private async getCurrentHotelPrice(
    city: string,
    starLevel: number,
    date: string
  ): Promise<number | null> {
    // 1. 尝试从实时价格API获取
    try {
      const realtimePrice = await this.getRealtimeHotelPrice(city, starLevel, date);
      if (realtimePrice !== null) {
        this.logger.debug(`从实时API获取价格: ${realtimePrice}`);
        return realtimePrice;
      }
    } catch (error: any) {
      this.logger.warn(`实时价格API获取失败: ${error.message}`);
    }

    // 2. 降级：从数据库查询该日期对应的估算价格
    try {
      const targetDate = new Date(date);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;
      const quarter = Math.floor((month - 1) / 3) + 1;

      // 查询季度价格
      const quarterlyData = await this.prisma.hotelWideData_Quarterly.findFirst({
        where: {
          city,
          starRating: starLevel,
        },
      });

      if (quarterlyData) {
        const quarterField = `q${year}_Q${quarter}` as keyof typeof quarterlyData;
        const quarterPrice = quarterlyData[quarterField] as number | null | undefined;

        if (quarterPrice !== null && quarterPrice !== undefined) {
          this.logger.debug(`从数据库获取季度价格: ${quarterPrice}`);
          return Math.round(quarterPrice);
        }
      }

      // 如果季度价格不存在，使用城市-星级基础价格
      const starCityPrice = await this.prisma.starCityPriceDetail.findUnique({
        where: {
          city_starRating: {
            city,
            starRating: starLevel,
          },
        },
      });

      if (starCityPrice && starCityPrice.avgPrice) {
        this.logger.debug(`从数据库获取基础价格: ${starCityPrice.avgPrice}`);
        return Math.round(starCityPrice.avgPrice);
      }
    } catch (error: any) {
      this.logger.warn(`数据库查询失败: ${error.message}`);
    }

    return null;
  }

  /**
   * 从实时价格API获取当前价格
   * 
   * 支持的API：
   * 1. Booking.com API (需要合作伙伴权限)
   * 2. Expedia API (需要合作伙伴权限)
   * 3. Hotels.com API (需要合作伙伴权限)
   * 4. Amadeus Hotel API - https://developers.amadeus.com/
   */
  private async getRealtimeHotelPrice(
    city: string,
    starLevel: number,
    date: string
  ): Promise<number | null> {
    // 检查是否配置了实时价格API
    const apiProvider = process.env.REALTIME_HOTEL_API_PROVIDER;
    const apiKey = process.env.REALTIME_HOTEL_API_KEY;

    if (!apiProvider || !apiKey) {
      return null; // 未配置实时API
    }

    try {
      switch (apiProvider.toUpperCase()) {
        case 'AMADEUS':
          return await this.getAmadeusHotelPrice(city, starLevel, date, apiKey);
        case 'BOOKING':
          return await this.getBookingHotelPrice(city, starLevel, date, apiKey);
        default:
          this.logger.warn(`不支持的实时价格API提供商: ${apiProvider}`);
          return null;
      }
    } catch (error: any) {
      this.logger.error(`实时价格API调用失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 从 Amadeus Hotel API 获取价格
   */
  private async getAmadeusHotelPrice(
    city: string,
    starLevel: number,
    date: string,
    apiKey: string
  ): Promise<number | null> {
    // TODO: 实现 Amadeus Hotel API 调用
    // 参考: https://developers.amadeus.com/self-service/category/hotel/api-doc/hotel-search
    
    this.logger.debug('Amadeus Hotel API 调用（待实现）');
    return null;
  }

  /**
   * 从 Booking.com API 获取价格
   */
  private async getBookingHotelPrice(
    city: string,
    starLevel: number,
    date: string,
    apiKey: string
  ): Promise<number | null> {
    // TODO: 实现 Booking.com API 调用
    // 注意：Booking.com API 需要合作伙伴权限
    
    this.logger.debug('Booking.com API 调用（待实现）');
    return null;
  }

  /**
   * 获取历史酒店价格数据
   * 
   * 从 HotelWideData_Quarterly 表查询历史数据，生成每日价格序列
   */
  private async getHistoricalHotelPrices(
    city: string,
    starLevel: number
  ): Promise<Array<{ date: string; price: number }>> {
    this.logger.debug(`查询历史酒店价格数据: ${city}, ${starLevel}星`);

    // 查询该城市-星级的季度价格数据
    const quarterlyData = await this.prisma.hotelWideData_Quarterly.findFirst({
      where: {
        city,
        starRating: starLevel,
      },
    });

    if (!quarterlyData) {
      this.logger.warn(`未找到 ${city} ${starLevel}星 的历史数据，使用模拟数据`);
      return this.generateMockHistoricalData(starLevel);
    }

    // 从季度数据生成每日价格序列
    const historicalData: Array<{ date: string; price: number }> = [];
    const today = new Date();
    const twoYearsAgo = new Date(today);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    // 生成过去2年的每日价格
    for (let d = new Date(twoYearsAgo); d <= today; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const quarter = Math.floor((month - 1) / 3) + 1;
      const quarterField = `q${year}_Q${quarter}` as keyof typeof quarterlyData;

      // 获取季度价格
      const quarterPrice = quarterlyData[quarterField] as number | null | undefined;

      if (quarterPrice !== null && quarterPrice !== undefined) {
        // 在季度价格基础上添加月度波动
        const monthInQuarter = ((month - 1) % 3) + 1;
        const monthlyFactor = 0.95 + (monthInQuarter - 1) * 0.05; // 季度内月度波动
        const price = Math.round(quarterPrice * monthlyFactor);

        historicalData.push({
          date: d.toISOString().split('T')[0],
          price,
        });
      }
    }

    // 如果数据不足，使用城市-星级的基础价格
    if (historicalData.length < 30) {
      const starCityPrice = await this.prisma.starCityPriceDetail.findUnique({
        where: {
          city_starRating: {
            city,
            starRating: starLevel,
          },
        },
      });

      if (starCityPrice && starCityPrice.avgPrice) {
        // 使用基础价格生成完整序列
        const basePrice = starCityPrice.avgPrice;
        for (let d = new Date(twoYearsAgo); d <= today; d.setDate(d.getDate() + 1)) {
          const month = d.getMonth() + 1;
          const seasonalFactor = 1 + 0.2 * Math.sin((month - 1) * Math.PI / 6);
          const price = Math.round(basePrice * seasonalFactor);

          if (!historicalData.find((h) => h.date === d.toISOString().split('T')[0])) {
            historicalData.push({
              date: d.toISOString().split('T')[0],
              price,
            });
          }
        }
      }
    }

    this.logger.debug(`生成历史价格数据: ${historicalData.length} 条`);
    return historicalData.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 生成模拟历史数据（当数据库中没有数据时使用）
   */
  private generateMockHistoricalData(starLevel: number): Array<{ date: string; price: number }> {
    const mockData: Array<{ date: string; price: number }> = [];
    const today = new Date();

    for (let i = 730; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      const basePrice = 300 * starLevel;
      const month = date.getMonth() + 1;
      const seasonalFactor = 1 + 0.3 * Math.sin((month - 1) * Math.PI / 6);
      const randomFactor = 0.85 + Math.random() * 0.3;
      const price = Math.round(basePrice * seasonalFactor * randomFactor);

      mockData.push({
        date: date.toISOString().split('T')[0],
        price,
      });
    }

    return mockData;
  }

  /**
   * 计算历史价格趋势
   */
  private calculateHistoricalTrend(
    data: Array<{ date: string; price: number }>
  ): HistoricalTrend {
    if (data.length === 0) {
      return {
        mean_price: 0,
        min_price: 0,
        max_price: 0,
        std_price: 0,
        sample_count: 0,
      };
    }

    const prices = data.map((d) => d.price);
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    
    // 计算标准差
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
    const std = Math.sqrt(variance);

    return {
      mean_price: Math.round(mean),
      min_price: min,
      max_price: max,
      std_price: Math.round(std),
      sample_count: data.length,
    };
  }

  /**
   * 生成价格预测（未来30天）
   * 
   * 优先使用 Prophet 模型（如果可用且数据充足）
   * 降级到历史同期均值法（如果 Prophet 不可用或数据不足）
   */
  private async generateForecast(
    historicalData: Array<{ date: string; price: number }>,
    startDate: string,
    days: number
  ): Promise<PriceForecast[]> {
    // 尝试使用 Prophet 模型
    try {
      const availability = await this.prophetService.checkAvailability();
      if (availability.available && historicalData.length >= 30) {
        this.logger.debug('使用 Prophet 模型进行预测');
        return await this.prophetService.predict(historicalData, startDate, days);
      } else {
        this.logger.debug(`降级到历史同期均值法: ${availability.message}`);
      }
    } catch (error: any) {
      this.logger.warn(`Prophet 预测失败，降级到历史同期均值法: ${error.message}`);
    }

    // 降级到历史同期均值法
    return this.generateForecastWithHistoricalMean(historicalData, startDate, days);
  }

  /**
   * 使用历史同期均值法生成预测（MVP 版本）
   */
  private generateForecastWithHistoricalMean(
    historicalData: Array<{ date: string; price: number }>,
    startDate: string,
    days: number
  ): PriceForecast[] {
    const forecast: PriceForecast[] = [];
    const start = new Date(startDate);

    // 使用历史同期均值法
    for (let i = 0; i < days; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      
      const month = date.getMonth() + 1;
      const day = date.getDate();
      
      // 查找历史同期数据（同月同日）
      const sameMonthDayData = historicalData.filter((d) => {
        const dDate = new Date(d.date);
        return dDate.getMonth() + 1 === month && dDate.getDate() === day;
      });

      let predictedPrice: number;
      let lowerBound: number;
      let upperBound: number;
      let trend: 'up' | 'down' | 'stable';

      if (sameMonthDayData.length > 0) {
        const prices = sameMonthDayData.map((d) => d.price);
        const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        const std = Math.sqrt(
          prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length
        );
        
        predictedPrice = Math.round(mean);
        lowerBound = Math.round(mean - 1.96 * std);
        upperBound = Math.round(mean + 1.96 * std);
        
        // 判断趋势
        const weekAgo = new Date(date);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoData = historicalData.filter((d) => {
          const dDate = new Date(d.date);
          return dDate.getMonth() + 1 === weekAgo.getMonth() + 1 &&
                 dDate.getDate() === weekAgo.getDate();
        });
        
        if (weekAgoData.length > 0) {
          const weekAgoMean = weekAgoData.reduce((sum, d) => sum + d.price, 0) / weekAgoData.length;
          if (mean > weekAgoMean * 1.05) {
            trend = 'up';
          } else if (mean < weekAgoMean * 0.95) {
            trend = 'down';
          } else {
            trend = 'stable';
          }
        } else {
          trend = 'stable';
        }
      } else {
        const allPrices = historicalData.map((d) => d.price);
        const overallMean = allPrices.reduce((sum, p) => sum + p, 0) / allPrices.length;
        const overallStd = Math.sqrt(
          allPrices.reduce((sum, p) => sum + Math.pow(p - overallMean, 2), 0) / allPrices.length
        );
        
        predictedPrice = Math.round(overallMean);
        lowerBound = Math.round(overallMean - 1.96 * overallStd);
        upperBound = Math.round(overallMean + 1.96 * overallStd);
        trend = 'stable';
      }

      forecast.push({
        date: date.toISOString().split('T')[0],
        price: predictedPrice,
        lower_bound: Math.max(0, lowerBound),
        upper_bound: upperBound,
        trend,
        confidence: 0.8,
      });
    }

    return forecast;
  }

  /**
   * 生成买入信号
   */
  private generateBuySignal(
    currentPrice: number,
    historicalMean: number,
    predictedPrice: number
  ): BuySignal {
    const priceChangePercent = ((currentPrice - historicalMean) / historicalMean) * 100;
    
    let signal: 'BUY' | 'WAIT' | 'NEUTRAL';
    let reason: string;
    let recommendation: string;

    if (priceChangePercent < -15) {
      signal = 'BUY';
      reason = `当前价格低于历史均值 ${Math.abs(Math.round(priceChangePercent))}%`;
      recommendation = '当前价格处于低位，建议立即预订';
    } else if (priceChangePercent > 15) {
      signal = 'WAIT';
      reason = `当前价格高于历史均值 ${Math.round(priceChangePercent)}%`;
      recommendation = '当前价格处于高位，建议观望等待';
    } else {
      signal = 'NEUTRAL';
      reason = `当前价格处于历史均值附近（${priceChangePercent > 0 ? '+' : ''}${Math.round(priceChangePercent)}%）`;
      recommendation = '当前价格处于正常范围，可根据行程安排决定';
    }

    return {
      signal,
      reason,
      current_price: currentPrice,
      historical_mean: historicalMean,
      predicted_price: predictedPrice,
      price_change_percent: Math.round(priceChangePercent * 100) / 100,
      recommendation,
    };
  }
}

