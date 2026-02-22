// src/countries/countries.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrencyStrategyDto } from './dto/currency-strategy.dto';
import { CountryPackDto, CreateOrUpdateCountryPackDto } from './dto/country-pack.dto';
import { GetCountriesQueryDto } from './dto/get-countries-query.dto';
import { CountryProfileDto } from './dto/country-profile.dto';
import { CurrencyMathUtil } from '../common/utils/currency-math.util';
import { getCountryPack, COUNTRY_PACKS, CountryPack } from '../trips/readiness/config/country-pack.config';
import { Prisma } from '@prisma/client';

@Injectable()
export class CountriesService {
  private readonly logger = new Logger(CountriesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 获取国家的货币策略
   * 
   * 返回完整的货币和支付信息，包括：
   * - 汇率和速算口诀（🇨🇳 中国特定：CNY基准）
   * - 支付画像和建议（🌍 通用）
   * - 快速对照表（🇨🇳 中国特定：CNY基准）
   * 
   * 字段分类：
   * - 🌍 通用字段：currencyCode, currencyName, paymentType, paymentInfo（适用于所有国家用户）
   * - 🇨🇳 中国特定字段：exchangeRateToCNY（仅对中国用户有意义）
   * 
   * @param countryCode 国家代码（ISO 3166-1 alpha-2），如 "JP", "IS"
   * @returns 货币策略信息
   */
  async getCurrencyStrategy(countryCode: string): Promise<CurrencyStrategyDto> {
    const profile = await this.prisma.countryProfile.findUnique({
      where: { isoCode: countryCode.toUpperCase() },
    });

    if (!profile) {
      throw new NotFoundException(`未找到国家代码为 ${countryCode} 的国家档案`);
    }

    // 生成速算口诀和对照表（如果有汇率）
    // 🇨🇳 注意：exchangeRateToCNY 是中国特定字段，仅对中国用户有意义
    // 未来国际化时，需要支持多基准货币（USD, EUR等）
    let quickRule: string | undefined;
    let quickTip: string | undefined;
    let quickTable: Array<{ local: number; home: number }> | undefined;

    if (profile.exchangeRateToCNY && profile.currencyCode) {
      quickRule = CurrencyMathUtil.generateRule(profile.exchangeRateToCNY);
      quickTip = CurrencyMathUtil.formatTip(
        profile.exchangeRateToCNY,
        profile.currencyCode,
        profile.currencyName || undefined
      );
      quickTable = CurrencyMathUtil.generateQuickTable(profile.exchangeRateToCNY);
    }

    // 解析支付建议
    const paymentAdvice = profile.paymentInfo as any;

    return {
      countryCode: profile.isoCode,
      countryName: profile.nameCN,
      currencyCode: profile.currencyCode || '',
      currencyName: profile.currencyName || '',
      paymentType: profile.paymentType || 'BALANCED',
      exchangeRateToCNY: profile.exchangeRateToCNY || undefined,
      exchangeRateToUSD: profile.exchangeRateToUSD || undefined,
      quickRule,
      quickTip,
      quickTable,
      paymentAdvice: paymentAdvice
        ? {
            tipping: paymentAdvice.tipping || paymentAdvice.tips,
            atm_network: paymentAdvice.atm_network,
            wallet_apps: paymentAdvice.wallet_apps || paymentAdvice.apps,
            cash_preparation: paymentAdvice.cash_preparation,
          }
        : undefined,
    };
  }

  /**
   * 获取所有国家列表
   * 支持搜索和分页
   * 
   * 返回字段分类：
   * - 🌍 通用字段：isoCode, nameCN, nameEN, currencyCode, currencyName, paymentType（适用于所有国家用户）
   * - 🇨🇳 中国特定字段：exchangeRateToCNY（仅对中国用户有意义）
   * - 🌍 国际化字段：exchangeRateToUSD（国际标准基准，适用于所有用户）
   * 
   * @param query 查询参数（搜索关键词、limit、offset）
   * @returns 国家列表和分页信息
   */
  async findAll(query: GetCountriesQueryDto): Promise<{
    countries: any[];
    total: number;
    hasMore: boolean;
    limit: number;
    offset: number;
  }> {
    // 如果没有指定limit，默认返回所有国家
    // 限制limit最大值，防止性能问题（国家数量通常不超过300个）
    const maxLimit = 1000;
    let { q, limit, offset = 0 } = query;
    
    // 如果没有指定limit，返回所有国家
    if (limit === undefined) {
      // 先查询总数，然后使用总数作为limit
      const totalCount = await this.prisma.countryProfile.count({
        where: q ? {
          OR: [
            { nameCN: { contains: q.trim() } },
            { nameEN: { contains: q.trim(), mode: 'insensitive' } },
            { isoCode: { contains: q.trim().toUpperCase() } },
          ],
        } : {},
      });
      limit = totalCount;
      this.logger.debug(`[CountriesService.findAll] 未指定limit，自动设置为总数: ${limit}`);
    }
    
    // 限制limit不超过最大值
    if (limit > maxLimit) {
      limit = maxLimit;
      this.logger.warn(`[CountriesService.findAll] limit超过最大值${maxLimit}，已自动调整为${maxLimit}`);
    }

    try {
      this.logger.debug(`[CountriesService.findAll] 收到查询参数: ${JSON.stringify({ q, limit, offset })}`);

      // 构建where条件
      const whereCondition: Prisma.CountryProfileWhereInput = {};

      // 如果有搜索关键词，添加搜索条件
      if (q) {
        const searchTerm = q.trim();
        // 对于中文，mode: 'insensitive' 不需要，但对于英文需要
        // 使用多个条件，对中文字段不使用 mode，对英文字段使用 mode
        const upperSearchTerm = searchTerm.toUpperCase();
        whereCondition.OR = [
          { nameCN: { contains: searchTerm } }, // 中文不需要 case insensitive
          { nameEN: { contains: searchTerm, mode: 'insensitive' } }, // 英文需要 case insensitive
          { isoCode: { contains: upperSearchTerm } }, // ISO代码部分匹配（大写）
        ];
        this.logger.debug(`[CountriesService.findAll] 搜索关键词: ${searchTerm}`);
      }

      // 查询总数
      const total = await this.prisma.countryProfile.count({
        where: whereCondition,
      });

      // 查询国家列表
      const countries = await this.prisma.countryProfile.findMany({
        where: whereCondition,
        select: {
          isoCode: true,           // 🌍 通用
          nameCN: true,            // 🌍 通用
          nameEN: true,            // 🌍 通用（新增，用于国际化）
          currencyCode: true,      // 🌍 通用
          currencyName: true,      // 🌍 通用
          paymentType: true,       // 🌍 通用
          exchangeRateToCNY: true, // 🇨🇳 中国特定
          exchangeRateToUSD: true, // 🌍 国际化字段
        },
        take: limit,
        skip: offset,
        orderBy: {
          nameCN: 'asc',
        },
      });

      const hasMore = offset + countries.length < total;

      this.logger.debug(`[CountriesService.findAll] ✅ 查询结果: ${countries.length} 个国家 (total=${total}, hasMore=${hasMore})`);

      return {
        countries,
        total,
        hasMore,
        limit,
        offset,
      };
    } catch (error: any) {
      this.logger.error(`Failed to find countries: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取目的地支持的交易货币列表（用于澄清阶段让用户选择）
   *
   * 支持列表 = 目的地本地货币 + 常用旅客货币（CNY, USD, EUR）
   * 若国家档案不存在，回退为 [CNY, USD, EUR]
   *
   * @param destinationCode 目的地国家代码（ISO 3166-1 alpha-2）
   * @returns 支持的货币列表，含 code、name、isLocal
   */
  async getSupportedCurrencies(destinationCode: string): Promise<
    Array<{ code: string; name: string; isLocal: boolean }>
  > {
    const TRAVELER_CURRENCIES: Array<{ code: string; name: string }> = [
      { code: 'CNY', name: '人民币' },
      { code: 'USD', name: '美元' },
      { code: 'EUR', name: '欧元' },
    ];

    const CURRENCY_NAMES: Record<string, string> = {
      CNY: '人民币',
      USD: '美元',
      EUR: '欧元',
      JPY: '日元',
      ISK: '冰岛克朗',
      NOK: '挪威克朗',
      SEK: '瑞典克朗',
      DKK: '丹麦克朗',
      GBP: '英镑',
      CHF: '瑞士法郎',
      AUD: '澳元',
      CAD: '加元',
    };

    try {
      const profile = await this.prisma.countryProfile.findUnique({
        where: { isoCode: destinationCode.toUpperCase() },
      });

      const result: Array<{ code: string; name: string; isLocal: boolean }> = [];
      const seen = new Set<string>();

      if (profile?.currencyCode) {
        const localCode = profile.currencyCode.toUpperCase();
        if (!seen.has(localCode)) {
          seen.add(localCode);
          result.push({
            code: localCode,
            name: profile.currencyName || CURRENCY_NAMES[localCode] || localCode,
            isLocal: true,
          });
        }
      }

      for (const { code, name } of TRAVELER_CURRENCIES) {
        if (!seen.has(code)) {
          seen.add(code);
          result.push({ code, name, isLocal: false });
        }
      }

      return result.length > 0 ? result : TRAVELER_CURRENCIES.map((c) => ({ ...c, isLocal: false }));
    } catch {
      return TRAVELER_CURRENCIES.map((c) => ({ ...c, isLocal: false }));
    }
  }

  /**
   * 获取国家 Pack 配置
   * 
   * 返回指定国家的地形策略配置（风险阈值、体力等级映射、地形约束）
   * 
   * @param countryCode 国家代码
   * @returns Country Pack 配置
   */
  async getCountryPack(countryCode: string): Promise<CountryPackDto> {
    const pack = getCountryPack(countryCode);
    return {
      countryCode: pack.countryCode,
      countryName: pack.countryName,
      riskThresholds: pack.riskThresholds,
      effortLevelMapping: pack.effortLevelMapping,
      terrainConstraints: pack.terrainConstraints,
    };
  }

  /**
   * 获取所有国家 Pack 配置列表
   * 
   * @returns 所有国家 Pack 配置列表
   */
  async getAllCountryPacks(): Promise<CountryPackDto[]> {
    return Object.values(COUNTRY_PACKS).map(pack => ({
      countryCode: pack.countryCode,
      countryName: pack.countryName,
      riskThresholds: pack.riskThresholds,
      effortLevelMapping: pack.effortLevelMapping,
      terrainConstraints: pack.terrainConstraints,
    }));
  }

  /**
   * 创建或更新国家 Pack 配置
   * 
   * 注意：目前实现为只读查询，实际更新需要修改配置文件或添加持久化存储
   * 此方法目前会抛出错误，提示需要手动修改配置文件
   * 
   * @param countryCode 国家代码
   * @param dto 创建/更新数据
   * @returns 更新后的配置
   */
  async createOrUpdateCountryPack(
    countryCode: string,
    dto: CreateOrUpdateCountryPackDto,
  ): Promise<CountryPackDto> {
    // TODO: 实现持久化存储（数据库或配置文件写入）
    // 目前配置是硬编码在 country-pack.config.ts 中
    // 临时实现：返回当前配置，提示需要手动修改
    throw new NotFoundException(
      `Country Pack 配置目前通过配置文件管理。请修改 src/trips/readiness/config/country-pack.config.ts 中的 COUNTRY_PACKS 配置。` +
      `国家代码: ${countryCode}`
    );
  }

  /**
   * 获取完整的国家档案信息
   * 
   * 返回所有字段，包括：
   * - 基础字段（isoCode, nameCN, nameEN, updatedAt）
   * - 货币和支付字段（currencyCode, currencyName, exchangeRateToCNY, exchangeRateToUSD, paymentType, paymentInfo）
   * - 所有JSON字段（powerInfo, emergency, visaForCN, complianceInfo, travelCulture）
   * 
   * @param countryCode 国家代码（ISO 3166-1 alpha-2）
   * @returns 完整的国家档案信息
   */
  async getCountryProfile(countryCode: string): Promise<CountryProfileDto> {
    const profile = await this.prisma.countryProfile.findUnique({
      where: { isoCode: countryCode.toUpperCase() },
    });

    if (!profile) {
      throw new NotFoundException(`未找到国家代码为 ${countryCode} 的国家档案`);
    }

    return {
      isoCode: profile.isoCode,
      nameCN: profile.nameCN,
      nameEN: profile.nameEN || undefined,
      updatedAt: profile.updatedAt,
      currencyCode: profile.currencyCode || undefined,
      currencyName: profile.currencyName || undefined,
      exchangeRateToCNY: profile.exchangeRateToCNY || undefined,
      exchangeRateToUSD: profile.exchangeRateToUSD || undefined,
      paymentType: profile.paymentType || undefined,
      paymentInfo: profile.paymentInfo as any || undefined,
      powerInfo: profile.powerInfo as any || undefined,
      emergency: profile.emergency as any || undefined,
      visaForCN: profile.visaForCN as any || undefined,
      complianceInfo: profile.complianceInfo as any || undefined,
      travelCulture: profile.travelCulture as any || undefined,
    };
  }
}

