// src/hotels/services/hotel-price.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * 酒店价格估算服务
 * 
 * 基于查找表进行价格估算：
 * - HotelPriceDetail: 城市基础价格
 * - StarCityPriceDetail: 城市-星级质量调整因子
 * - HotelWideData_Quarterly: 季度价格数据（可选，用于更精确的季度估算）
 */
@Injectable()
export class HotelPriceService {
  private readonly logger = new Logger(HotelPriceService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 估算酒店价格
   * 
   * @param city 城市名称
   * @param starRating 星级（1-5）
   * @param year 年份（可选，用于季度估算）
   * @param quarter 季度（1-4，可选）
   * @returns 估算价格和详细信息
   */
  async estimatePrice(
    city: string,
    starRating: number,
    year?: number,
    quarter?: number
  ): Promise<{
    estimatedPrice: number;
    lowerBound: number;
    upperBound: number;
    basePrice: number;
    cityStarFactor: number;
    quarterPrice?: number;
    sampleCount: number;
  }> {
    this.logger.debug(`估算酒店价格: ${city}, ${starRating}星, ${year}年Q${quarter}`);

    // 1. 获取城市基础价格（从 HotelPriceDetail）
    const cityPrice = await this.prisma.hotelPriceDetail.findUnique({
      where: { city },
    });

    if (!cityPrice) {
      this.logger.warn(`未找到城市 ${city} 的基础价格数据，使用默认值`);
      return {
        estimatedPrice: 500,
        lowerBound: 400,
        upperBound: 600,
        basePrice: 500,
        cityStarFactor: 1.0,
        sampleCount: 0,
      };
    }

    // 2. 获取城市-星级质量调整因子（从 StarCityPriceDetail）
    const starPrice = await this.prisma.starCityPriceDetail.findUnique({
      where: {
        city_starRating: {
          city,
          starRating,
        },
      },
    });

    if (!starPrice) {
      this.logger.warn(`未找到 ${city} ${starRating}星 的质量因子，使用默认值`);
      // 使用城市基础价格
      const medianPrice = cityPrice.medianPrice || 500;
      const estimatedPrice = Math.round(medianPrice);
      return {
        estimatedPrice,
        lowerBound: Math.round(estimatedPrice * 0.8),
        upperBound: Math.round(estimatedPrice * 1.2),
        basePrice: medianPrice,
        cityStarFactor: 1.0,
        sampleCount: cityPrice.sampleCount,
      };
    }

    // 3. 如果有年份和季度，尝试获取季度价格（从 HotelWideData_Quarterly）
    let quarterPrice: number | undefined;
    if (year && quarter) {
      const quarterField = `${year}_Q${quarter}`;
      // 使用动态字段名查询（字段名是数字开头，需要使用标识符引用）
      try {
        const quarterlyData = await this.prisma.$queryRawUnsafe<Array<{
          price: number | null;
        }>>(
          `SELECT "${quarterField}"::FLOAT as price
           FROM "HotelWideData_Quarterly"
           WHERE city = $1
           AND "starRating" = $2
           AND "${quarterField}" IS NOT NULL
           LIMIT 1`,
          city,
          starRating
        );

        if (quarterlyData.length > 0 && quarterlyData[0].price !== null) {
          quarterPrice = quarterlyData[0].price;
        }
      } catch (error) {
        this.logger.warn(`查询季度价格失败: ${year}年Q${quarter}`, error);
        // 继续使用基础价格
      }
    }

    // 4. 计算估算价格
    // 优先使用季度价格，否则使用基础价格 × 质量因子
    const basePrice = quarterPrice || (cityPrice.medianPrice ?? 500);
    const cityStarFactor = starPrice.cityStarFactor ?? 1.0;
    const estimatedPrice = Math.round(basePrice * cityStarFactor);

    // 5. 计算价格范围（±20%）
    const lowerBound = Math.round(estimatedPrice * 0.8);
    const upperBound = Math.round(estimatedPrice * 1.2);

    return {
      estimatedPrice,
      lowerBound,
      upperBound,
      basePrice: basePrice ?? 500,
      cityStarFactor: cityStarFactor ?? 1.0,
      quarterPrice,
      sampleCount: starPrice.sampleCount,
    };
  }

  /**
   * 获取城市的所有星级价格选项
   * 
   * @param city 城市名称
   * @returns 该城市所有星级的价格选项
   */
  async getCityStarOptions(city: string): Promise<Array<{
    starRating: number;
    avgPrice: number;
    cityStarFactor: number;
    sampleCount: number;
    minPrice: number | null;
    maxPrice: number | null;
  }>> {
    const options = await this.prisma.starCityPriceDetail.findMany({
      where: { city },
      orderBy: { starRating: 'asc' },
      select: {
        starRating: true,
        avgPrice: true,
        cityStarFactor: true,
        sampleCount: true,
        minPrice: true,
        maxPrice: true,
      },
    });

    return options.map(opt => ({
      starRating: opt.starRating,
      avgPrice: opt.avgPrice ?? 0,
      cityStarFactor: opt.cityStarFactor ?? 1.0,
      sampleCount: opt.sampleCount,
      minPrice: opt.minPrice,
      maxPrice: opt.maxPrice,
    }));
  }

  /**
   * 获取城市的季度价格趋势
   * 
   * @param city 城市名称
   * @param starRating 星级（可选）
   * @returns 季度价格趋势数据
   */
  async getQuarterlyTrend(
    city: string,
    starRating?: number
  ): Promise<Array<{
    year: number;
    quarter: number;
    price: number;
  }>> {
    const where: any = { city };
    if (starRating !== undefined) {
      where.starRating = starRating;
    }

    const data = await this.prisma.hotelWideData_Quarterly.findMany({
      where,
      select: {
        city: true,
        starRating: true,
        q2018_Q1: true,
        q2018_Q2: true,
        q2018_Q3: true,
        q2018_Q4: true,
        q2019_Q1: true,
        q2019_Q2: true,
        q2019_Q3: true,
        q2019_Q4: true,
        q2020_Q1: true,
        q2020_Q2: true,
        q2020_Q3: true,
        q2020_Q4: true,
        q2021_Q1: true,
        q2021_Q2: true,
        q2021_Q3: true,
        q2021_Q4: true,
        q2022_Q1: true,
        q2022_Q2: true,
        q2022_Q3: true,
        q2022_Q4: true,
        q2023_Q1: true,
        q2023_Q2: true,
        q2023_Q3: true,
        q2023_Q4: true,
        q2024_Q1: true,
      },
    });

    // 将宽表数据转换为时间序列
    const trend: Array<{ year: number; quarter: number; price: number }> = [];

    data.forEach((row) => {
      const quarters = [
        { year: 2018, q: 1, field: 'q2018_Q1' },
        { year: 2018, q: 2, field: 'q2018_Q2' },
        { year: 2018, q: 3, field: 'q2018_Q3' },
        { year: 2018, q: 4, field: 'q2018_Q4' },
        { year: 2019, q: 1, field: 'q2019_Q1' },
        { year: 2019, q: 2, field: 'q2019_Q2' },
        { year: 2019, q: 3, field: 'q2019_Q3' },
        { year: 2019, q: 4, field: 'q2019_Q4' },
        { year: 2020, q: 1, field: 'q2020_Q1' },
        { year: 2020, q: 2, field: 'q2020_Q2' },
        { year: 2020, q: 3, field: 'q2020_Q3' },
        { year: 2020, q: 4, field: 'q2020_Q4' },
        { year: 2021, q: 1, field: 'q2021_Q1' },
        { year: 2021, q: 2, field: 'q2021_Q2' },
        { year: 2021, q: 3, field: 'q2021_Q3' },
        { year: 2021, q: 4, field: 'q2021_Q4' },
        { year: 2022, q: 1, field: 'q2022_Q1' },
        { year: 2022, q: 2, field: 'q2022_Q2' },
        { year: 2022, q: 3, field: 'q2022_Q3' },
        { year: 2022, q: 4, field: 'q2022_Q4' },
        { year: 2023, q: 1, field: 'q2023_Q1' },
        { year: 2023, q: 2, field: 'q2023_Q2' },
        { year: 2023, q: 3, field: 'q2023_Q3' },
        { year: 2023, q: 4, field: 'q2023_Q4' },
        { year: 2024, q: 1, field: 'q2024_Q1' },
      ];

      quarters.forEach(({ year, q, field }) => {
        const price = row[field as keyof typeof row] as number | null;
        if (price !== null && price > 0) {
          trend.push({ year, quarter: q, price });
        }
      });
    });

    // 如果指定了星级，按年份和季度分组计算平均值
    if (starRating !== undefined) {
      const grouped = new Map<string, { total: number; count: number }>();
      trend.forEach(({ year, quarter, price }) => {
        const key = `${year}_Q${quarter}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.total += price;
          existing.count += 1;
        } else {
          grouped.set(key, { total: price, count: 1 });
        }
      });

      return Array.from(grouped.entries())
        .map(([key, stats]) => {
          const [year, quarter] = key.split('_Q');
          return {
            year: parseInt(year),
            quarter: parseInt(quarter),
            price: Math.round(stats.total / stats.count),
          };
        })
        .sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return a.quarter - b.quarter;
        });
    }

    return trend.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.quarter - b.quarter;
    });
  }

  /**
   * 根据城市、星级和价格范围推荐酒店
   * 
   * @param city 城市名称
   * @param starRating 星级（1-5）
   * @param minPrice 最低价格（可选）
   * @param maxPrice 最高价格（可选）
   * @param limit 返回数量限制，默认 10
   * @returns 推荐的酒店列表
   */
  async recommendHotels(
    city: string,
    starRating: number,
    minPrice?: number,
    maxPrice?: number,
    limit: number = 10
  ): Promise<Array<{
    id: string;
    name: string;
    brand: string | null;
    address: string | null;
    district: string | null;
    lat: number | null;
    lng: number | null;
    phone: string | null;
  }>> {
    this.logger.debug(`推荐酒店: ${city}, ${starRating}星, 价格范围: ${minPrice}-${maxPrice}`);

    // 从 RawHotelData_Slim 查询酒店
    // 注意：RawHotelData_Slim 表中没有星级字段，我们需要根据品牌或其他方式推断
    // 这里先按城市查询，后续可以根据品牌映射星级
    // 处理城市名称：支持"洛阳市"、"洛阳"、"北京市"、"北京"等格式
    const cityName = city.replace('市', ''); // "洛阳市" -> "洛阳"
    const cityWithSuffix = city.endsWith('市') ? city : `${city}市`; // "洛阳" -> "洛阳市"
    
    const hotels = await this.prisma.rawHotelData_Slim.findMany({
      where: {
        OR: [
          { city: { equals: city } }, // 精确匹配
          { city: { equals: cityWithSuffix } }, // 带"市"后缀
          { city: { equals: cityName } }, // 不带"市"后缀
          { city: { contains: cityName } }, // 包含匹配（处理"洛阳市洛龙区"等情况）
        ],
      },
      take: limit * 5, // 多取一些，后续可以按品牌筛选
    });

    this.logger.debug(`查询到 ${hotels.length} 家酒店（城市: ${city}）`);

    // 品牌到星级的映射（常见品牌）
    const brandStarMap: Record<string, number> = {
      // 5星品牌（豪华酒店）
      '希尔顿': 5,
      'Hilton': 5,
      '华尔道夫': 5,
      'Waldorf Astoria': 5,
      '康莱德': 5,
      'Conrad': 5,
      '希尔顿嘉悦里': 5,
      'Canopy by Hilton': 5,
      '万豪': 5,
      'JW万豪': 5,
      'JW Marriott': 5,
      '喜来登': 5,
      'Sheraton': 5,
      '洲际': 5,
      'InterContinental': 5,
      '丽思卡尔顿': 5,
      'Ritz-Carlton': 5,
      '四季': 5,
      'Four Seasons': 5,
      '凯悦': 5,
      'Hyatt': 5,
      '香格里拉': 5,
      'Shangri-La': 5,
      '瑞吉': 5,
      'St. Regis': 5,
      'W酒店': 5,
      'W Hotels': 5,
      '威斯汀': 5,
      'Westin': 5,
      '万丽': 5,
      'Renaissance': 5,
      '万豪行政公寓': 5,
      'Marriott Executive Apartments': 5,
      // 4星品牌（中高端酒店）
      '皇冠假日': 4,
      'Crowne Plaza': 4,
      '假日': 4,
      'Holiday Inn': 4,
      '智选假日': 4,
      'Holiday Inn Express': 4,
      '万怡': 4,
      'Courtyard': 4,
      '万枫': 4,
      'Fairfield': 4,
      '希尔顿花园': 4,
      'Hilton Garden Inn': 4,
      '希尔顿逸林': 4,
      'DoubleTree by Hilton': 4,
      '希尔顿格芮': 4,
      'Curio Collection by Hilton': 4,
      '希尔顿欢朋': 4,
      'Hampton by Hilton': 4,
      '希尔顿惠庭': 4,
      'Home2 Suites by Hilton': 4,
      '福朋': 4,
      'Four Points': 4,
      '雅高': 4,
      'Accor': 4,
      '诺富特': 4,
      'Novotel': 4,
      '美居': 4,
      'Mercure': 4,
      '桔子': 4,
      '全季': 4,
      '亚朵': 4,
      // 3星品牌（经济型酒店）
      '如家': 3,
      '汉庭': 3,
      '锦江': 3,
      // 2星品牌
      '7天': 2,
    };

    // 根据星级筛选酒店
    const filteredHotels = hotels
      .map((hotel) => {
        // 尝试从品牌推断星级
        let inferredStar = 0;
        if (hotel.brand) {
          for (const [brand, star] of Object.entries(brandStarMap)) {
            if (hotel.brand.includes(brand)) {
              inferredStar = star;
              break;
            }
          }
        }

        return {
          hotel,
          inferredStar,
        };
      })
      .filter((item) => {
        // 如果无法推断星级，或者推断的星级匹配目标星级
        if (item.inferredStar === 0) {
          // 无法推断时，返回所有酒店（让用户自己选择）
          return true;
        }
        return item.inferredStar === starRating;
      })
      .slice(0, limit)
      .map((item) => ({
        id: item.hotel.id,
        name: item.hotel.name || '未知酒店',
        brand: item.hotel.brand,
        address: item.hotel.address,
        district: item.hotel.district,
        lat: item.hotel.lat,
        lng: item.hotel.lng,
        phone: item.hotel.phone,
      }));

    this.logger.debug(`找到 ${filteredHotels.length} 家推荐酒店（筛选前: ${hotels.length} 家）`);

    if (filteredHotels.length === 0 && hotels.length > 0) {
      const brands = Array.from(new Set(hotels.map(h => h.brand).filter((b): b is string => b !== null)));
      this.logger.warn(`未找到匹配 ${starRating} 星级的酒店，但找到了 ${hotels.length} 家酒店。品牌分布: ${brands.join(', ')}`);
    }

    return filteredHotels;
  }

  /**
   * 估算价格并推荐酒店（组合接口）
   * 
   * @param city 城市名称
   * @param starRating 星级（1-5）
   * @param year 年份（可选）
   * @param quarter 季度（可选）
   * @param includeRecommendations 是否包含推荐酒店，默认 false
   * @param recommendationLimit 推荐酒店数量，默认 5
   * @returns 估算价格和推荐酒店
   */
  async estimatePriceWithRecommendations(
    city: string,
    starRating: number,
    year?: number,
    quarter?: number,
    includeRecommendations: boolean = false,
    recommendationLimit: number = 5
  ): Promise<{
    estimatedPrice: number;
    lowerBound: number;
    upperBound: number;
    basePrice: number;
    cityStarFactor: number;
    quarterPrice?: number;
    sampleCount: number;
    recommendations?: Array<{
      id: string;
      name: string;
      brand: string | null;
      address: string | null;
      district: string | null;
      lat: number | null;
      lng: number | null;
      phone: string | null;
    }>;
  }> {
    // 先获取价格估算
    const priceEstimate = await this.estimatePrice(city, starRating, year, quarter);

    const result: any = { ...priceEstimate };

    // 如果需要推荐酒店
    if (includeRecommendations) {
      const recommendations = await this.recommendHotels(
        city,
        starRating,
        priceEstimate.lowerBound,
        priceEstimate.upperBound,
        recommendationLimit
      );
      result.recommendations = recommendations;
    }

    return result;
  }
}
