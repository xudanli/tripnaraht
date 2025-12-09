// src/trips/services/flight-price.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 机票价格参考服务
 * 
 * 功能：
 * 1. 查询机票+签证的估算成本
 * 2. 支持按国家代码和出发城市查询
 * 3. 返回保守估算值（旺季价格或平均值）
 */
@Injectable()
export class FlightPriceService {
  private readonly logger = new Logger(FlightPriceService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 获取机票+签证的估算成本
   * 
   * 查询策略：
   * 1. 优先查询指定出发城市的价格
   * 2. 如果没有，查询任意出发城市的价格（originCity = null）
   * 3. 返回保守值：旺季价格（作为安全线）或平均值
   * 
   * @param countryCode 目的地国家代码，如 "JP", "US"
   * @param originCity 出发城市代码（可选），如 "PEK", "PVG"
   * @param useConservative 是否使用保守估算（旺季价格），默认 true
   * @returns 估算成本（机票 + 签证，单位：元）
   */
  async getEstimatedCost(
    countryCode: string,
    originCity?: string,
    useConservative: boolean = true
  ): Promise<number> {
    const code = countryCode.toUpperCase();

    // 1. 优先查询指定出发城市的价格
    let priceRef = null;
    if (originCity) {
      priceRef = await this.prisma.flightPriceReference.findFirst({
        where: {
          countryCode: code,
          originCity: originCity.toUpperCase(),
        },
        orderBy: {
          lastUpdated: 'desc', // 取最新的记录
        },
      });
    }

    // 2. 如果没有找到，查询任意出发城市的价格
    if (!priceRef) {
      priceRef = await this.prisma.flightPriceReference.findFirst({
        where: {
          countryCode: code,
          originCity: null,
        },
        orderBy: {
          lastUpdated: 'desc',
        },
      });
    }

    // 3. 如果仍然没有找到，返回默认值
    if (!priceRef) {
      this.logger.warn(
        `未找到国家 ${code} 的机票价格参考，使用默认值 5000 元`
      );
      return 5000; // 默认值
    }

    // 4. 计算总成本（机票 + 签证）
    const flightPrice = useConservative
      ? priceRef.highSeasonPrice // 保守估算：使用旺季价格
      : priceRef.averagePrice; // 一般估算：使用平均价格

    const totalCost = flightPrice + priceRef.visaCost;

    this.logger.debug(
      `查询 ${code} 机票价格：${flightPrice} 元（${useConservative ? '旺季' : '平均'}）+ 签证 ${priceRef.visaCost} 元 = 总计 ${totalCost} 元`
    );

    return totalCost;
  }

  /**
   * 获取详细的价格信息（用于调试或前端展示）
   * 
   * @param countryCode 目的地国家代码
   * @param originCity 出发城市代码（可选）
   * @returns 详细价格信息
   */
  async getPriceDetails(
    countryCode: string,
    originCity?: string
  ): Promise<{
    flightPrice: {
      lowSeason: number;
      highSeason: number;
      average: number;
    };
    visaCost: number;
    total: {
      conservative: number; // 保守估算（旺季）
      average: number; // 平均估算
    };
    source?: string;
    lastUpdated?: Date;
  } | null> {
    const code = countryCode.toUpperCase();

    let priceRef = null;
    if (originCity) {
      priceRef = await this.prisma.flightPriceReference.findFirst({
        where: {
          countryCode: code,
          originCity: originCity.toUpperCase(),
        },
        orderBy: {
          lastUpdated: 'desc',
        },
      });
    }

    if (!priceRef) {
      priceRef = await this.prisma.flightPriceReference.findFirst({
        where: {
          countryCode: code,
          originCity: null,
        },
        orderBy: {
          lastUpdated: 'desc',
        },
      });
    }

    if (!priceRef) {
      return null;
    }

    return {
      flightPrice: {
        lowSeason: priceRef.lowSeasonPrice,
        highSeason: priceRef.highSeasonPrice,
        average: priceRef.averagePrice,
      },
      visaCost: priceRef.visaCost,
      total: {
        conservative: priceRef.highSeasonPrice + priceRef.visaCost,
        average: priceRef.averagePrice + priceRef.visaCost,
      },
      source: priceRef.source || undefined,
      lastUpdated: priceRef.lastUpdated,
    };
  }

  /**
   * 获取所有价格参考数据
   */
  async findAll() {
    return this.prisma.flightPriceReference.findMany({
      orderBy: [
        { countryCode: 'asc' },
        { originCity: 'asc' },
        { lastUpdated: 'desc' },
      ],
    });
  }

  /**
   * 根据 ID 查找价格参考数据
   */
  async findOne(id: number) {
    return this.prisma.flightPriceReference.findUnique({
      where: { id },
    });
  }

  /**
   * 创建价格参考数据
   */
  async create(data: {
    countryCode: string;
    originCity?: string | null;
    lowSeasonPrice: number;
    highSeasonPrice: number;
    visaCost?: number;
    source?: string;
    notes?: string;
  }) {
    const averagePrice = Math.round(
      (data.lowSeasonPrice + data.highSeasonPrice) / 2
    );

    return this.prisma.flightPriceReference.create({
      data: {
        countryCode: data.countryCode.toUpperCase(),
        originCity: data.originCity ? data.originCity.toUpperCase() : null,
        lowSeasonPrice: data.lowSeasonPrice,
        highSeasonPrice: data.highSeasonPrice,
        averagePrice: averagePrice,
        visaCost: data.visaCost || 0,
        source: data.source,
        notes: data.notes,
      },
    });
  }

  /**
   * 更新价格参考数据
   */
  async update(
    id: number,
    data: {
      countryCode?: string;
      originCity?: string | null;
      lowSeasonPrice?: number;
      highSeasonPrice?: number;
      visaCost?: number;
      source?: string;
      notes?: string;
    }
  ) {
    const updateData: any = { ...data };

    // 如果更新了价格，重新计算平均价格
    if (data.lowSeasonPrice !== undefined || data.highSeasonPrice !== undefined) {
      const existing = await this.prisma.flightPriceReference.findUnique({
        where: { id },
      });
      if (existing) {
        const lowPrice = data.lowSeasonPrice ?? existing.lowSeasonPrice;
        const highPrice = data.highSeasonPrice ?? existing.highSeasonPrice;
        updateData.averagePrice = Math.round((lowPrice + highPrice) / 2);
      }
    }

    if (updateData.countryCode) {
      updateData.countryCode = updateData.countryCode.toUpperCase();
    }
    if (updateData.originCity !== undefined) {
      updateData.originCity = updateData.originCity
        ? updateData.originCity.toUpperCase()
        : null;
    }

    return this.prisma.flightPriceReference.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * 删除价格参考数据
   */
  async remove(id: number) {
    return this.prisma.flightPriceReference.delete({
      where: { id },
    });
  }
}

