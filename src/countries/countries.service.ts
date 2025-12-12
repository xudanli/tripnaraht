// src/countries/countries.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrencyStrategyDto } from './dto/currency-strategy.dto';
import { CurrencyMathUtil } from '../common/utils/currency-math.util';

@Injectable()
export class CountriesService {
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
   * 
   * 返回字段分类：
   * - 🌍 通用字段：isoCode, nameCN, nameEN, currencyCode, currencyName, paymentType（适用于所有国家用户）
   * - 🇨🇳 中国特定字段：exchangeRateToCNY（仅对中国用户有意义）
   * - 🌍 国际化字段：exchangeRateToUSD（国际标准基准，适用于所有用户）
   * 
   * @returns 国家列表（包含基本信息和货币代码）
   */
  async findAll() {
    return this.prisma.countryProfile.findMany({
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
      orderBy: {
        nameCN: 'asc',
      },
    });
  }
}

