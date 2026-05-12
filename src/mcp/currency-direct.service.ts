/**
 * Currency Exchange Direct Service
 * 
 * 直接使用 ExchangeRate API（免费），不依赖 Smithery MCP 服务
 * 支持实时汇率查询、货币转换、历史汇率查询等功能
 * 支持用户级别的货币偏好设置
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface ExchangeRateParams {
  base?: string; // 基础货币代码（默认: USD）
  symbols?: string[]; // 目标货币代码数组（可选，默认返回所有）
  date?: string; // 历史日期（YYYY-MM-DD 格式，可选）
}

export interface CurrencyConversionParams {
  amount: number;
  from: string; // 源货币代码
  to: string; // 目标货币代码
  date?: string; // 历史日期（可选）
}

export interface ExchangeRateResponse {
  base: string;
  date: string;
  rates: Record<string, number>; // 货币代码 -> 汇率
}

@Injectable()
export class CurrencyDirectService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CurrencyDirectService.name);
  private axiosInstance!: AxiosInstance;
  private apiKey: string | null = null;
  private isAvailable: boolean = false;
  private readonly baseUrl = 'https://api.exchangerate-api.com/v4';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // ExchangeRate API 免费版本不需要 API Key
    // 但如果配置了 API Key，可以使用付费版本
    this.apiKey = 
      this.configService.get<string>('EXCHANGE_RATE_API_KEY') || 
      process.env.EXCHANGE_RATE_API_KEY ||
      null;
  }

  async onModuleInit() {
    // 初始化 HTTP 客户端（支持代理）
    const proxyUrl =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy;
    
    const httpsAgent = proxyUrl
      ? new HttpsProxyAgent<string>(proxyUrl)
      : new https.Agent({
          keepAlive: true,
          family: 4, // 强制 IPv4
          rejectUnauthorized: true,
        });

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      httpsAgent,
      proxy: false,
      headers: {
        'User-Agent': 'TripNARA/1.0',
      },
    });

    // 测试连接（免费版本不需要认证）
    try {
      const testResponse = await this.axiosInstance.get('/latest/USD');
      
      if (testResponse.data && testResponse.data.rates) {
        this.isAvailable = true;
        this.logger.log('Currency Direct Service initialized');
      } else {
        this.logger.warn('ExchangeRate API test returned unexpected format');
        this.isAvailable = false;
      }
    } catch (error: any) {
      this.logger.error('Failed to initialize Currency Direct Service:', error.message);
      this.isAvailable = false;
    }
  }

  async onModuleDestroy() {
    this.logger.log('Currency Direct Service destroyed');
  }

  /**
   * 检查服务是否可用
   */
  isServiceAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * 获取最新汇率
   */
  async getLatestRates(params: ExchangeRateParams = {}): Promise<ExchangeRateResponse> {
    if (!this.isServiceAvailable()) {
      throw new Error('Currency Exchange service is not available');
    }

    try {
      const base = params.base || 'USD';
      const url = `/latest/${base}`;
      
      const response = await this.axiosInstance.get(url);

      if (!response.data || !response.data.rates) {
        throw new Error('Invalid response from ExchangeRate API');
      }

      let rates = response.data.rates;

      // 如果指定了目标货币，只返回这些货币的汇率
      if (params.symbols && params.symbols.length > 0) {
        const filteredRates: Record<string, number> = {};
        for (const symbol of params.symbols) {
          if (rates[symbol] !== undefined) {
            filteredRates[symbol] = rates[symbol];
          }
        }
        rates = filteredRates;
      }

      return {
        base: response.data.base || base,
        date: response.data.date || new Date().toISOString().split('T')[0],
        rates,
      };
    } catch (error: any) {
      this.logger.error('Failed to get latest rates:', error.message);
      throw error;
    }
  }

  /**
   * 获取历史汇率
   */
  async getHistoricalRates(params: ExchangeRateParams & { date: string }): Promise<ExchangeRateResponse> {
    if (!this.isServiceAvailable()) {
      throw new Error('Currency Exchange service is not available');
    }

    try {
      const base = params.base || 'USD';
      const date = params.date; // YYYY-MM-DD 格式

      if (!date) {
        throw new Error('Date is required for historical rates');
      }

      const url = `/history/${base}/${date}`;
      
      const response = await this.axiosInstance.get(url);

      if (!response.data || !response.data.rates) {
        throw new Error('Invalid response from ExchangeRate API');
      }

      let rates = response.data.rates;

      // 如果指定了目标货币，只返回这些货币的汇率
      if (params.symbols && params.symbols.length > 0) {
        const filteredRates: Record<string, number> = {};
        for (const symbol of params.symbols) {
          if (rates[symbol] !== undefined) {
            filteredRates[symbol] = rates[symbol];
          }
        }
        rates = filteredRates;
      }

      return {
        base: response.data.base || base,
        date: response.data.date || date,
        rates,
      };
    } catch (error: any) {
      this.logger.error('Failed to get historical rates:', error.message);
      throw error;
    }
  }

  /**
   * 货币转换
   */
  async convertCurrency(params: CurrencyConversionParams): Promise<{
    amount: number;
    from: string;
    to: string;
    result: number;
    rate: number;
    date: string;
  }> {
    if (!this.isServiceAvailable()) {
      throw new Error('Currency Exchange service is not available');
    }

    try {
      const { amount, from, to, date } = params;

      // 获取汇率
      let exchangeRateResponse: ExchangeRateResponse;
      if (date) {
        exchangeRateResponse = await this.getHistoricalRates({
          base: from,
          symbols: [to],
          date,
        });
      } else {
        exchangeRateResponse = await this.getLatestRates({
          base: from,
          symbols: [to],
        });
      }

      const rate = exchangeRateResponse.rates[to];
      if (!rate) {
        throw new Error(`Exchange rate not found for ${from} to ${to}`);
      }

      const result = amount * rate;

      return {
        amount,
        from,
        to,
        result: Math.round(result * 100) / 100, // 保留两位小数
        rate,
        date: exchangeRateResponse.date,
      };
    } catch (error: any) {
      this.logger.error('Failed to convert currency:', error.message);
      throw error;
    }
  }

  /**
   * 批量货币转换
   */
  async convertMultipleCurrencies(
    amount: number,
    from: string,
    to: string[]
  ): Promise<Array<{
    to: string;
    result: number;
    rate: number;
  }>> {
    if (!this.isServiceAvailable()) {
      throw new Error('Currency Exchange service is not available');
    }

    try {
      const exchangeRateResponse = await this.getLatestRates({
        base: from,
        symbols: to,
      });

      return to.map((currency) => {
        const rate = exchangeRateResponse.rates[currency];
        if (!rate) {
          throw new Error(`Exchange rate not found for ${from} to ${currency}`);
        }
        return {
          to: currency,
          result: Math.round(amount * rate * 100) / 100,
          rate,
        };
      });
    } catch (error: any) {
      this.logger.error('Failed to convert multiple currencies:', error.message);
      throw error;
    }
  }

  /**
   * 获取汇率趋势（最近 N 天的汇率变化）
   */
  async getRateTrend(
    from: string,
    to: string,
    days: number = 7
  ): Promise<Array<{
    date: string;
    rate: number;
  }>> {
    if (!this.isServiceAvailable()) {
      throw new Error('Currency Exchange service is not available');
    }

    try {
      const trends: Array<{ date: string; rate: number }> = [];
      const today = new Date();

      for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        try {
          const exchangeRateResponse = await this.getHistoricalRates({
            base: from,
            symbols: [to],
            date: dateStr,
          });

          const rate = exchangeRateResponse.rates[to];
          if (rate) {
            trends.push({
              date: dateStr,
              rate,
            });
          }
        } catch (error: any) {
          // 如果某一天的数据不可用，跳过
          this.logger.warn(`Failed to get rate for ${dateStr}:`, error.message);
        }
      }

      return trends.reverse(); // 按日期正序排列
    } catch (error: any) {
      this.logger.error('Failed to get rate trend:', error.message);
      throw error;
    }
  }

  /**
   * 获取用户货币偏好
   */
  async getUserCurrencySettings(userId: string): Promise<{
    defaultCurrency: string;
    preferredCurrencies: string[];
  } | null> {
    try {
      const settings = await this.prisma.currencySettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        return null;
      }

      return {
        defaultCurrency: settings.defaultCurrency || 'USD',
        preferredCurrencies: (settings.preferredCurrencies as string[]) || [],
      };
    } catch (error: any) {
      this.logger.error('Failed to get user currency settings:', error.message);
      throw error;
    }
  }

  /**
   * 保存用户货币偏好
   */
  async saveUserCurrencySettings(
    userId: string,
    settings: {
      defaultCurrency?: string;
      preferredCurrencies?: string[];
    }
  ): Promise<void> {
    try {
      await this.prisma.currencySettings.upsert({
        where: { userId },
        create: {
          userId,
          defaultCurrency: settings.defaultCurrency || 'USD',
          preferredCurrencies: settings.preferredCurrencies || [],
        },
        update: {
          defaultCurrency: settings.defaultCurrency,
          preferredCurrencies: settings.preferredCurrencies,
          updatedAt: new Date(),
        },
      });
    } catch (error: any) {
      this.logger.error('Failed to save user currency settings:', error.message);
      throw error;
    }
  }

  /**
   * 获取支持的货币列表
   */
  getSupportedCurrencies(): string[] {
    // ExchangeRate API 支持的主要货币
    return [
      'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD',
      'NZD', 'KRW', 'INR', 'BRL', 'MXN', 'RUB', 'ZAR', 'SEK', 'NOK', 'DKK',
      'PLN', 'CZK', 'HUF', 'ILS', 'TRY', 'THB', 'MYR', 'PHP', 'IDR', 'VND',
      // 更多货币...
    ];
  }
}
