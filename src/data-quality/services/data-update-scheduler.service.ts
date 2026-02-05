// src/data-quality/services/data-update-scheduler.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { DataCollectionService } from './data-collection.service';
import { DataQualityAlertService } from './data-quality-alert.service';
import {
  GEOGRAPHIC_DATA_UPDATE_CONFIG,
  UpdateFrequency,
  shouldUpdate,
} from '../config/geographic-data-update.config';

/**
 * 更新任务
 */
export interface UpdateTask {
  dataSource: string;
  dataType: string;
  countryCode?: string;
  frequency: UpdateFrequency;
  lastUpdated: Date;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * 更新结果
 */
export interface UpdateResult {
  success: boolean;
  dataSource: string;
  dataType: string;
  error?: string;
  recordsUpdated?: number;
  duration?: number; // 毫秒
}

/**
 * 数据自动更新调度器服务
 * 
 * 功能：
 * - 定时检查需要更新的数据源
 * - 执行数据更新任务（并行，最多5个并发）
 * - 失败重试机制（最多3次）
 * - 记录更新历史
 */
@Injectable()
export class DataUpdateSchedulerService {
  private readonly logger = new Logger(DataUpdateSchedulerService.name);
  private readonly maxConcurrent = 5; // 最大并发数
  private readonly maxRetries = 3; // 最大重试次数

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataCollection: DataCollectionService,
    private readonly alertService: DataQualityAlertService,
  ) {}

  /**
   * 定时任务：每天 02:00 UTC 执行更新任务
   */
  @Cron('0 2 * * *', { timeZone: 'UTC' })
  async runUpdateTasks() {
    this.logger.log('开始执行数据自动更新任务...');

    try {
      const tasks = await this.getUpdateTasks();
      this.logger.log(`找到 ${tasks.length} 个需要更新的任务`);

      if (tasks.length === 0) {
        this.logger.log('没有需要更新的任务');
        return;
      }

      // 并行执行更新任务（最多5个并发）
      await this.executeUpdateTasksInParallel(tasks);

      this.logger.log('数据自动更新任务完成');
    } catch (error: any) {
      this.logger.error(`数据自动更新任务失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 获取需要更新的任务列表
   */
  async getUpdateTasks(): Promise<UpdateTask[]> {
    const tasks: UpdateTask[] = [];

    // 1. 从KnowledgeFile表获取物理现实数据源
    const knowledgeFiles = await this.prisma.knowledgeFile.findMany({
      where: {
        category: 'PHYSICAL_REALITY',
      },
      select: {
        filename: true,
        category: true,
        updatedAt: true,
      },
    });

    for (const file of knowledgeFiles) {
      // 从filename解析数据类型和国家代码
      const filename = file.filename;
      let dataType = 'unknown';
      let countryCode = 'UNKNOWN';
      
      if (filename.includes('road-status')) {
        dataType = 'road_status';
      } else if (filename.includes('ferry')) {
        dataType = 'ferry_schedules';
      } else if (filename.includes('weather')) {
        dataType = 'weather_windows';
      }
      
      // 从filename提取国家代码
      const countryMatch = filename.match(/(ch|no|pe|is|gl|fo|nz|sj|ar)/i);
      if (countryMatch) {
        countryCode = countryMatch[1].toUpperCase();
      }
      
      // 根据数据类型确定更新频率
      let frequency: UpdateFrequency;
      if (dataType === 'road_status' || dataType === 'weather_windows') {
        frequency = UpdateFrequency.DAILY;
      } else if (dataType === 'ferry_schedules') {
        frequency = UpdateFrequency.WEEKLY;
      } else {
        frequency = UpdateFrequency.MONTHLY;
      }

      // 检查是否需要更新
      if (shouldUpdate(file.updatedAt, frequency)) {
        tasks.push({
          dataSource: file.filename,
          dataType,
          countryCode,
          frequency,
          lastUpdated: file.updatedAt,
          priority: this.determinePriority(dataType, countryCode),
        });
      }
    }

    // 2. 从GeographicDataQualityMonitor表获取地理数据源
    const geographicMonitors = await this.prisma.geographicDataQualityMonitor.findMany({
      select: {
        dataSource: true,
        dataType: true,
        countryCode: true,
        lastUpdated: true,
      },
    });

    for (const monitor of geographicMonitors) {
      // 根据数据类型获取更新频率
      let frequency: UpdateFrequency;
      if (monitor.dataType === 'DEM') {
        frequency = GEOGRAPHIC_DATA_UPDATE_CONFIG.DEM.frequency;
      } else {
        frequency = GEOGRAPHIC_DATA_UPDATE_CONFIG.GEOGRAPHIC_FEATURES.frequency;
      }

      // 检查是否需要更新
      if (shouldUpdate(monitor.lastUpdated, frequency)) {
        tasks.push({
          dataSource: monitor.dataSource,
          dataType: monitor.dataType,
          countryCode: monitor.countryCode,
          frequency,
          lastUpdated: monitor.lastUpdated,
          priority: this.determinePriority(monitor.dataType, monitor.countryCode),
        });
      }
    }

    // 按优先级排序
    tasks.sort((a, b) => {
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    return tasks;
  }

  /**
   * 并行执行更新任务
   */
  private async executeUpdateTasksInParallel(tasks: UpdateTask[]): Promise<void> {
    // 分批执行（每批最多5个并发）
    for (let i = 0; i < tasks.length; i += this.maxConcurrent) {
      const batch = tasks.slice(i, i + this.maxConcurrent);
      
      await Promise.all(
        batch.map(task => this.executeUpdateTask(task))
      );

      // 批次之间稍作延迟，避免数据库压力过大
      if (i + this.maxConcurrent < tasks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * 执行单个更新任务
   */
  async executeUpdateTask(task: UpdateTask): Promise<UpdateResult> {
    const startTime = Date.now();
    this.logger.log(`执行更新任务: ${task.dataSource} (${task.dataType})`);

    let lastError: Error | null = null;

    // 重试机制
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // 1. 采集数据
        const collectedData = await this.dataCollection.collectData(
          task.dataSource,
          task.dataType,
          {
            countryCode: task.countryCode,
            source: this.determineSource(task.dataType),
          }
        );

        // 2. 验证数据
        const validationResult = await this.dataCollection.validateData(
          collectedData,
          task.dataType
        );

        if (!validationResult.valid) {
          throw new Error(`数据验证失败: ${validationResult.errors.map(e => e.message).join(', ')}`);
        }

        // 3. 索引数据（更新KnowledgeFile和Chunk）
        const recordsUpdated = await this.dataCollection.indexData(
          collectedData,
          task.dataSource,
          task.dataType
        );

        const duration = Date.now() - startTime;
        this.logger.log(`更新任务成功: ${task.dataSource}，更新 ${recordsUpdated} 条记录，耗时 ${duration}ms`);

        return {
          success: true,
          dataSource: task.dataSource,
          dataType: task.dataType,
          recordsUpdated,
          duration,
        };
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `更新任务失败 (尝试 ${attempt}/${this.maxRetries}): ${task.dataSource} - ${error.message}`
        );

        // 如果不是最后一次尝试，等待后重试
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 指数退避
        }
      }
    }

    // 所有重试都失败
    const duration = Date.now() - startTime;
    this.logger.error(`更新任务最终失败: ${task.dataSource} - ${lastError?.message}`);

    // 触发告警
    await this.alertService.createAlert({
      severity: 'HIGH',
      alertType: 'UPDATE_FAILED',
      message: `数据更新失败: ${task.dataSource} (${task.dataType})，已重试 ${this.maxRetries} 次`,
      details: {
        dataSource: task.dataSource,
        dataType: task.dataType,
        error: lastError?.message,
        attempts: this.maxRetries,
      },
    });

    return {
      success: false,
      dataSource: task.dataSource,
      dataType: task.dataType,
      error: lastError?.message,
      duration,
    };
  }

  /**
   * 确定任务优先级
   */
  private determinePriority(dataType: string, countryCode?: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    // 核心国家的数据优先级更高
    const coreCountries = ['CH', 'NO', 'PE', 'IS'];
    const isCoreCountry = countryCode && coreCountries.includes(countryCode);

    // 关键数据类型优先级更高
    const criticalTypes = ['road_status', 'weather_windows', 'DEM', 'ROADS'];
    const isCriticalType = criticalTypes.includes(dataType);

    if (isCoreCountry && isCriticalType) {
      return 'HIGH';
    } else if (isCoreCountry || isCriticalType) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * 确定数据源类型
   */
  private determineSource(dataType: string): string {
    const sourceMap: Record<string, string> = {
      road_status: 'road_status_api',
      ferry_schedules: 'ferry_api',
      weather_windows: 'weather_api',
      DEM: 'physical_reality_file',
      RIVERS: 'osm',
      MOUNTAINS: 'osm',
      ROADS: 'osm',
      COASTLINES: 'osm',
      PORTS: 'osm',
      RAILWAYS: 'osm',
    };

    return sourceMap[dataType] || 'unknown';
  }
}
