// src/tasks/tasks.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

/**
 * 定时任务服务
 * 
 * 功能：
 * 1. 每天凌晨 4 点更新汇率
 * 2. 其他定时任务可以在这里扩展
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 更新汇率任务
   * 
   * 每天凌晨 4 点运行
   * 使用 ExchangeRate-API (免费层) 获取最新汇率
   * 
   * API 说明：
   * - 免费层：每月 1500 次请求
   * - 支持 CNY 作为基准货币
   * - 返回格式：{ "rates": { "JPY": 20.5, "USD": 0.14, ... } }
   */
  @Cron('0 4 * * *') // 每天凌晨 4 点 (CronExpression.EVERY_DAY_AT_4AM)
  async updateExchangeRates() {
    this.logger.log('开始更新汇率...');

    try {
      // 使用 ExchangeRate-API (免费，支持 CNY 基准)
      // 注意：如果超过免费额度，可以切换到 Frankfurter API
      const url = 'https://api.exchangerate-api.com/v4/latest/CNY';

      const { data } = await axios.get(url, {
        timeout: 10000, // 10 秒超时
      });

      const rates = data.rates; // { "JPY": 20.5, "USD": 0.14, "EUR": 0.13, ... }

      if (!rates || typeof rates !== 'object') {
        throw new Error('汇率 API 返回数据格式错误');
      }

      // 获取所有需要更新汇率的国家档案
      const countries = await this.prisma.countryProfile.findMany({
        where: {
          currencyCode: { not: null },
        },
        select: {
          isoCode: true,
          currencyCode: true,
        },
      });

      let updatedCount = 0;
      let errorCount = 0;

      // 遍历所有国家，更新汇率
      for (const country of countries) {
        if (!country.currencyCode) {
          continue;
        }

        // 从 API 返回的 rates 中获取该货币的汇率
        // 注意：API 返回的是 1 CNY = X 外币，我们需要存 1 外币 = 多少 CNY
        const rateFromCNY = rates[country.currencyCode];

        if (!rateFromCNY || rateFromCNY <= 0) {
          this.logger.warn(
            `未找到货币 ${country.currencyCode} 的汇率，跳过 ${country.isoCode}`
          );
          errorCount++;
          continue;
        }

        // 转换为 1 外币 = 多少 CNY
        const rateToCNY = 1 / rateFromCNY;

        // 更新数据库
        try {
          await this.prisma.countryProfile.update({
            where: { isoCode: country.isoCode },
            data: { exchangeRateToCNY: rateToCNY },
          });

          updatedCount++;
          this.logger.debug(
            `已更新 ${country.isoCode} (${country.currencyCode}): 1 ${country.currencyCode} = ${rateToCNY.toFixed(4)} CNY`
          );
        } catch (error) {
          this.logger.error(
            `更新 ${country.isoCode} 汇率失败: ${error instanceof Error ? error.message : String(error)}`
          );
          errorCount++;
        }
      }

      this.logger.log(
        `汇率更新完成：成功 ${updatedCount} 个，失败 ${errorCount} 个`
      );
    } catch (error) {
      this.logger.error(
        `汇率更新任务失败: ${error instanceof Error ? error.message : String(error)}`
      );
      // 不抛出错误，避免影响其他任务
    }
  }
}

