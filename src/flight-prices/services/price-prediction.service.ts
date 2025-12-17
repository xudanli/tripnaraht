// src/flight-prices/services/price-prediction.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FlightPricePredictionRequest,
  FlightPricePredictionResponse,
  PriceForecast,
  BuySignal,
  HistoricalTrend,
} from '../interfaces/price-prediction.interface';
import { ProphetService } from './prophet-service';

/**
 * 价格预测服务
 * 
 * 使用 Prophet 模型（或历史同期均值法）进行价格趋势预测
 */
@Injectable()
export class PricePredictionService {
  private readonly logger = new Logger(PricePredictionService.name);

  constructor(
    private prisma: PrismaService,
    private prophetService: ProphetService
  ) {}

  /**
   * 预测机票价格
   */
  async predictFlightPrice(
    request: FlightPricePredictionRequest
  ): Promise<FlightPricePredictionResponse> {
    this.logger.debug(
      `预测机票价格: ${request.from_city} -> ${request.to_city}, 日期: ${request.departure_date}`
    );

    // 1. 获取当前价格（如果有）
    const currentPrice = await this.getCurrentFlightPrice(
      request.from_city,
      request.to_city,
      request.departure_date
    );

    // 2. 获取历史价格数据
    const historicalData = await this.getHistoricalFlightPrices(
      request.from_city,
      request.to_city
    );

    // 3. 计算历史趋势
    const historicalTrend = this.calculateHistoricalTrend(historicalData);

    // 4. 生成价格预测（未来30天）
    const forecast = await this.generateForecast(
      historicalData,
      request.departure_date,
      30
    );

    // 5. 生成买入信号
    const buySignal = this.generateBuySignal(
      currentPrice || forecast[0]?.price || historicalTrend.mean_price,
      historicalTrend.mean_price,
      forecast[0]?.price || historicalTrend.mean_price
    );

    // 6. 价格对比（如果获取到实时价格）
    let priceComparison: FlightPricePredictionResponse['price_comparison'] | undefined;
    if (currentPrice !== null && forecast.length > 0) {
      const predictedPrice = forecast[0].price;
      const priceDifference = currentPrice - predictedPrice;
      const priceDifferencePercent = (priceDifference / predictedPrice) * 100;

      let comparisonStatus: 'MATCH' | 'HIGHER' | 'LOWER';
      if (Math.abs(priceDifferencePercent) < 5) {
        comparisonStatus = 'MATCH';
      } else if (priceDifferencePercent > 0) {
        comparisonStatus = 'HIGHER';
      } else {
        comparisonStatus = 'LOWER';
      }

      priceComparison = {
        predicted_price: predictedPrice,
        realtime_price: currentPrice,
        price_difference: Math.round(priceDifference),
        price_difference_percent: Math.round(priceDifferencePercent * 100) / 100,
        comparison_status: comparisonStatus,
      };
    }

    return {
      current_price: currentPrice || forecast[0]?.price || historicalTrend.mean_price,
      is_realtime_price: currentPrice !== null,
      buy_signal: buySignal,
      forecast,
      historical_trend: historicalTrend,
      price_comparison: priceComparison,
    };
  }

  /**
   * 获取当前机票价格
   * 
   * 优先从实时价格API获取，如果不可用则从数据库查询最新价格
   */
  private async getCurrentFlightPrice(
    fromCity: string,
    toCity: string,
    date: string
  ): Promise<number | null> {
    // 1. 尝试从实时价格API获取
    try {
      const realtimePrice = await this.getRealtimeFlightPrice(fromCity, toCity, date);
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
      const month = targetDate.getMonth() + 1;
      const dayOfWeek = targetDate.getDay() === 0 ? 6 : targetDate.getDay() - 1;
      const routeId = `${fromCity}->${toCity}`;

      const priceDetail = await this.prisma.flightPriceDetail.findFirst({
        where: {
          routeId,
          month,
          dayOfWeek,
        },
      });

      if (priceDetail) {
        const basePrice = priceDetail.monthlyBasePrice;
        const dayFactor = priceDetail.dayOfWeekFactor || 1.0;
        const estimatedPrice = Math.round(basePrice * dayFactor);
        this.logger.debug(`从数据库获取估算价格: ${estimatedPrice}`);
        return estimatedPrice;
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
   * 1. Amadeus API (推荐) - https://developers.amadeus.com/
   * 2. Skyscanner API - https://developers.skyscanner.net/
   * 3. FlightAware AeroAPI - https://www.flightaware.com/commercial/aeroapi/
   */
  private async getRealtimeFlightPrice(
    fromCity: string,
    toCity: string,
    date: string
  ): Promise<number | null> {
    // 检查是否配置了实时价格API
    const apiProvider = process.env.REALTIME_FLIGHT_API_PROVIDER;
    const apiKey = process.env.REALTIME_FLIGHT_API_KEY;

    if (!apiProvider || !apiKey) {
      return null; // 未配置实时API
    }

    try {
      switch (apiProvider.toUpperCase()) {
        case 'AMADEUS':
          return await this.getAmadeusPrice(fromCity, toCity, date, apiKey);
        case 'SKYSCANNER':
          return await this.getSkyscannerPrice(fromCity, toCity, date, apiKey);
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
   * 从 Amadeus API 获取价格
   */
  private async getAmadeusPrice(
    fromCity: string,
    toCity: string,
    date: string,
    apiKey: string
  ): Promise<number | null> {
    // TODO: 实现 Amadeus API 调用
    // 需要先获取 access token，然后调用 Flight Offers Search API
    // 参考: https://developers.amadeus.com/self-service/category/air/api-doc/flight-offers-search
    
    this.logger.debug('Amadeus API 调用（待实现）');
    return null;
  }

  /**
   * 从 Skyscanner API 获取价格
   */
  private async getSkyscannerPrice(
    fromCity: string,
    toCity: string,
    date: string,
    apiKey: string
  ): Promise<number | null> {
    // TODO: 实现 Skyscanner API 调用
    // 参考: https://developers.skyscanner.net/docs/flights/live-prices/overview
    
    this.logger.debug('Skyscanner API 调用（待实现）');
    return null;
  }

  /**
   * 获取历史机票价格数据
   */
  private async getHistoricalFlightPrices(
    fromCity: string,
    toCity: string
  ): Promise<Array<{ date: string; price: number }>> {
    const routeId = `${fromCity}->${toCity}`;
    this.logger.debug(`查询历史价格数据: ${routeId}`);

    // 查询该航线的所有历史数据（按月份和周几）
    const priceDetails = await this.prisma.flightPriceDetail.findMany({
      where: {
        routeId,
      },
      orderBy: [
        { month: 'asc' },
        { dayOfWeek: 'asc' },
      ],
    });

    if (priceDetails.length === 0) {
      this.logger.warn(`未找到航线 ${routeId} 的历史数据，使用模拟数据`);
      return this.generateMockHistoricalData();
    }

    // 从聚合数据生成每日价格序列
    const historicalData: Array<{ date: string; price: number }> = [];
    const today = new Date();
    const twoYearsAgo = new Date(today);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    // 生成过去2年的每日价格
    for (let d = new Date(twoYearsAgo); d <= today; d.setDate(d.getDate() + 1)) {
      const month = d.getMonth() + 1;
      const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1; // 转换为 0=周一, 6=周日

      // 查找匹配的月份和周几数据
      let matchedData = priceDetails.find(
        (p) => p.month === month && p.dayOfWeek === dayOfWeek
      );

      // 如果没找到精确匹配，使用月份数据
      if (!matchedData) {
        matchedData = priceDetails.find((p) => p.month === month && p.dayOfWeek === null);
      }

      // 如果还是没找到，使用该月份的平均值
      if (!matchedData) {
        const monthData = priceDetails.filter((p) => p.month === month);
        if (monthData.length > 0) {
          const avgBasePrice =
            monthData.reduce((sum, p) => sum + p.monthlyBasePrice, 0) / monthData.length;
          matchedData = {
            monthlyBasePrice: avgBasePrice,
            dayOfWeekFactor: 1.0,
          } as any;
        }
      }

      if (matchedData) {
        // 计算价格：基准价 × 周几因子
        const basePrice = matchedData.monthlyBasePrice;
        const dayFactor = matchedData.dayOfWeekFactor || 1.0;
        const price = Math.round(basePrice * dayFactor);

        historicalData.push({
          date: d.toISOString().split('T')[0],
          price,
        });
      }
    }

    this.logger.debug(`生成历史价格数据: ${historicalData.length} 条`);
    return historicalData;
  }

  /**
   * 生成模拟历史数据（当数据库中没有数据时使用）
   */
  private generateMockHistoricalData(): Array<{ date: string; price: number }> {
    const mockData: Array<{ date: string; price: number }> = [];
    const today = new Date();

    for (let i = 730; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      const basePrice = 1000;
      const month = date.getMonth() + 1;
      const seasonalFactor = 1 + 0.2 * Math.sin((month - 1) * Math.PI / 6);
      const randomFactor = 0.9 + Math.random() * 0.2;
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
    // 对于每一天，查找历史同期（同月同日）的平均价格
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
        lowerBound = Math.round(mean - 1.96 * std); // 95% 置信区间
        upperBound = Math.round(mean + 1.96 * std);
        
        // 判断趋势（与前一周对比）
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
        // 如果没有历史同期数据，使用整体均值
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
        confidence: 0.8, // MVP 版本固定置信度
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
    predictedPrice: number,
    isRealtimePrice: boolean = false
  ): BuySignal {
    const priceChangePercent = ((currentPrice - historicalMean) / historicalMean) * 100;
    
    let signal: 'BUY' | 'WAIT' | 'NEUTRAL';
    let reason: string;
    let recommendation: string;

    if (priceChangePercent < -15) {
      signal = 'BUY';
      reason = `当前价格低于历史均值 ${Math.abs(Math.round(priceChangePercent))}%`;
      recommendation = '当前价格处于低位，建议立即购买';
    } else if (priceChangePercent > 15) {
      signal = 'WAIT';
      reason = `当前价格高于历史均值 ${Math.round(priceChangePercent)}%`;
      recommendation = '当前价格处于高位，建议观望等待';
    } else {
      signal = 'NEUTRAL';
      reason = `当前价格处于历史均值附近（${priceChangePercent > 0 ? '+' : ''}${Math.round(priceChangePercent)}%）`;
      recommendation = '当前价格处于正常范围，可根据行程安排决定';
    }

    // 如果使用了实时价格，在建议中说明
    let finalRecommendation = recommendation;
    if (isRealtimePrice) {
      finalRecommendation += '（基于实时价格）';
    } else {
      finalRecommendation += '（基于历史数据估算）';
    }

    return {
      signal,
      reason,
      current_price: currentPrice,
      historical_mean: historicalMean,
      predicted_price: predictedPrice,
      price_change_percent: Math.round(priceChangePercent * 100) / 100,
      recommendation: finalRecommendation,
    };
  }

  /**
   * 对比实时价格和预测价格
   */
  async comparePrices(
    fromCity: string,
    toCity: string,
    date: string
  ): Promise<{
    predicted_price: number;
    realtime_price: number | null;
    price_difference: number | null;
    price_difference_percent: number | null;
    comparison_status: 'MATCH' | 'HIGHER' | 'LOWER' | 'UNAVAILABLE';
  }> {
    // 1. 获取预测价格
    const request: FlightPricePredictionRequest = {
      from_city: fromCity,
      to_city: toCity,
      departure_date: date,
    };

    const prediction = await this.predictFlightPrice(request);
    const predictedPrice = prediction.forecast[0]?.price || prediction.current_price;

    // 2. 获取实时价格
    const realtimePrice = await this.getCurrentFlightPrice(fromCity, toCity, date);

    if (realtimePrice === null) {
      return {
        predicted_price: predictedPrice,
        realtime_price: null,
        price_difference: null,
        price_difference_percent: null,
        comparison_status: 'UNAVAILABLE',
      };
    }

    // 3. 计算差异
    const priceDifference = realtimePrice - predictedPrice;
    const priceDifferencePercent = (priceDifference / predictedPrice) * 100;

    // 4. 判断状态
    let comparisonStatus: 'MATCH' | 'HIGHER' | 'LOWER';
    if (Math.abs(priceDifferencePercent) < 5) {
      comparisonStatus = 'MATCH'; // 差异小于5%认为匹配
    } else if (priceDifferencePercent > 0) {
      comparisonStatus = 'HIGHER'; // 实时价格更高
    } else {
      comparisonStatus = 'LOWER'; // 实时价格更低
    }

    return {
      predicted_price: predictedPrice,
      realtime_price: realtimePrice,
      price_difference: Math.round(priceDifference),
      price_difference_percent: Math.round(priceDifferencePercent * 100) / 100,
      comparison_status: comparisonStatus,
    };
  }
}

