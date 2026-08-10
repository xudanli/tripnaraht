// src/mcp/services/mcp-capability-manager.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { McpCapabilityDto, McpCapabilityStatus } from '../dto/mcp-capability.dto';
import { Prisma } from '@prisma/client';

/**
 * MCP 能力定义
 */
interface McpCapabilityDefinition {
  serviceName: string;
  displayName: string;
  description: string;
  tools: string[];
  category?: string;
  authRequired?: boolean;
  defaultEnabled?: boolean; // 默认是否启用
}

/**
 * MCP 能力管理器服务
 * 
 * 功能：管理所有 MCP 能力的启用/禁用状态
 * - 从数据库加载和保存能力状态（持久化存储）
 * - 提供内存缓存以提高查询性能
 * - 支持查询、启用、禁用、批量更新、统计等功能
 * - 自动初始化：服务启动时自动创建缺失的能力记录
 */
@Injectable()
export class McpCapabilityManagerService implements OnModuleInit {
  private readonly logger = new Logger(McpCapabilityManagerService.name);
  
  constructor(private readonly prisma: PrismaService) {}

  // 能力定义（所有可用的 MCP 服务）
  private readonly capabilityDefinitions: Map<string, McpCapabilityDefinition> = new Map([
    ['google_maps', {
      serviceName: 'google_maps',
      displayName: 'Google Maps',
      description: 'Google Maps API 服务，提供地点搜索、路线规划、地理编码等功能',
      tools: ['google_maps.searchPlaces', 'google_maps.geocode', 'google_maps.getRoute', 'google_maps.computeDistanceMatrix'],
      category: 'mapping',
      authRequired: false,
      defaultEnabled: true,
    }],
    ['weather', {
      serviceName: 'weather',
      displayName: 'Weather',
      description: '天气服务，提供当前天气和天气预报',
      tools: ['weather.getCurrentWeather', 'weather.getWeatherByDatetimeRange', 'weather.getCurrentDateTime'],
      category: 'weather',
      authRequired: false,
      defaultEnabled: true,
    }],
    ['postgresql', {
      serviceName: 'postgresql',
      displayName: 'PostgreSQL',
      description: 'PostgreSQL 数据库查询服务',
      tools: ['postgresql.query', 'postgresql.execute'],
      category: 'database',
      authRequired: false,
      defaultEnabled: true,
    }],
    ['airbnb', {
      serviceName: 'airbnb',
      displayName: 'Airbnb',
      description: 'Airbnb 房源搜索服务',
      tools: ['airbnb.search', 'airbnb.listingDetails'],
      category: 'accommodation',
      authRequired: true,
      defaultEnabled: true,
    }],
    ['rail', {
      serviceName: 'rail',
      displayName: 'Rail',
      description: '铁路查询服务',
      tools: ['rail.searchRoutes', 'rail.getRouteDetails'],
      category: 'transportation',
      authRequired: true,
      defaultEnabled: true,
    }],
    ['file_extractor', {
      serviceName: 'file_extractor',
      displayName: 'File Extractor',
      description: '文件内容提取服务',
      tools: ['file_extractor.extract_file_content'],
      category: 'utility',
      authRequired: false,
      defaultEnabled: true,
    }],
    ['stripe', {
      serviceName: 'stripe',
      displayName: 'Stripe',
      description: 'Stripe 支付服务',
      tools: ['stripe.createPaymentIntent', 'stripe.confirmPaymentIntent', 'stripe.getPaymentIntent', 'stripe.refundPayment'],
      category: 'payment',
      authRequired: true,
      defaultEnabled: true,
    }],
    ['browserbase', {
      serviceName: 'browserbase',
      displayName: 'Browserbase',
      description: 'Browserbase 浏览器自动化服务',
      tools: ['browserbase.createSession', 'browserbase.navigate', 'browserbase.screenshot', 'browserbase.click', 'browserbase.evaluate'],
      category: 'automation',
      authRequired: true,
      defaultEnabled: true,
    }],
    ['currency', {
      serviceName: 'currency',
      displayName: 'Currency Exchange',
      description: '货币汇率转换服务',
      tools: ['currency.getLatestRates', 'currency.convert', 'currency.getRateTrend'],
      category: 'finance',
      authRequired: false,
      defaultEnabled: true,
    }],
    ['hotel', {
      serviceName: 'hotel',
      displayName: 'Hotel',
      description: '酒店搜索服务',
      tools: ['hotel.search', 'hotel.getDetails'],
      category: 'accommodation',
      authRequired: false,
      defaultEnabled: true,
    }],
    ['activity', {
      serviceName: 'activity',
      displayName: 'Activity Booking',
      description: '活动/门票预订检索（Browserbase 探运营商页 + 静态目录回落）',
      tools: ['activity.search'],
      category: 'activity',
      authRequired: false,
      defaultEnabled: true,
    }],
    ['restaurant', {
      serviceName: 'restaurant',
      displayName: 'Restaurant',
      description: '餐厅搜索服务',
      tools: ['restaurant.search', 'restaurant.nearby'],
      category: 'dining',
      authRequired: false,
      defaultEnabled: true,
    }],
    ['translation', {
      serviceName: 'translation',
      displayName: 'Translation',
      description: '翻译服务',
      tools: ['translation.translate', 'translation.detectLanguage'],
      category: 'utility',
      authRequired: false,
      defaultEnabled: true,
    }],
    ['image', {
      serviceName: 'image',
      displayName: 'Image Search',
      description: '图片搜索服务',
      tools: ['image.search', 'image.recommend'],
      category: 'media',
      authRequired: false,
      defaultEnabled: true,
    }],
    ['vision', {
      serviceName: 'vision',
      displayName: 'Vision Service',
      description: '视觉识别服务，提供 OCR 和 POI 识别',
      tools: ['vision.poiRecommend', 'ocr.extractText'],
      category: 'vision',
      authRequired: false,
      defaultEnabled: true,
    }],
  ]);

  // 能力状态缓存（服务名称 -> 是否启用）
  private capabilityStatusCache: Map<string, boolean> = new Map();

  async onModuleInit() {
    // 从数据库加载所有能力状态
    await this.loadCapabilitiesFromDatabase();
    this.logger.log(`Initialized ${this.capabilityStatusCache.size} MCP capabilities from database`);
  }

  /**
   * 从数据库加载能力状态
   */
  private async loadCapabilitiesFromDatabase(): Promise<void> {
    try {
      // 确保所有能力定义都在数据库中存在
      for (const [serviceName, def] of this.capabilityDefinitions) {
        const existing = await this.prisma.mcpCapability.findUnique({
          where: { serviceName },
        });

        if (!existing) {
          // 创建默认记录
          await this.prisma.mcpCapability.create({
            data: {
              serviceName,
              displayName: def.displayName,
              description: def.description,
              enabled: def.defaultEnabled ?? true,
              tools: def.tools,
              category: def.category,
              authRequired: def.authRequired ?? false,
              defaultEnabled: def.defaultEnabled ?? true,
            },
          });
          this.logger.log(`Created default capability record: ${serviceName}`);
        }

        // 加载状态到缓存
        const capability = await this.prisma.mcpCapability.findUnique({
          where: { serviceName },
        });
        if (capability) {
          this.capabilityStatusCache.set(serviceName, capability.enabled ?? false);
        }
      }
    } catch (error: any) {
      this.logger.error(`Failed to load capabilities from database: ${error.message}`, error.stack);
      // 如果数据库加载失败，使用内存默认值
      this.capabilityDefinitions.forEach((def, serviceName) => {
        this.capabilityStatusCache.set(serviceName, def.defaultEnabled ?? true);
      });
    }
  }

  /**
   * 获取所有能力列表
   */
  async getAllCapabilities(filters?: {
    serviceName?: string;
    status?: McpCapabilityStatus;
    category?: string;
  }): Promise<McpCapabilityDto[]> {
    try {
      // 构建 Prisma 查询条件
      const where: Prisma.McpCapabilityWhereInput = {};
      
      if (filters?.serviceName) {
        where.serviceName = filters.serviceName;
      }
      if (filters?.category) {
        where.category = filters.category;
      }
      if (filters?.status) {
        where.enabled = filters.status === McpCapabilityStatus.ENABLED;
      }

      // 从数据库查询
      const dbCapabilities = await this.prisma.mcpCapability.findMany({
        where,
        orderBy: { serviceName: 'asc' },
      });

      // 转换为 DTO
      return dbCapabilities.map(cap => ({
        serviceName: cap.serviceName,
        displayName: cap.displayName,
        description: cap.description || '', // 确保 description 字段始终存在，即使数据库为空也返回空字符串
        enabled: cap.enabled ?? false,
        tools: Array.isArray(cap.tools) ? cap.tools as string[] : [],
        category: cap.category || undefined,
        authRequired: cap.authRequired ?? false,
      }));
    } catch (error: any) {
      this.logger.error(`Failed to get capabilities: ${error.message}`, error.stack);
      // 降级到内存缓存
      return this.getAllCapabilitiesFromCache(filters);
    }
  }

  /**
   * 从缓存获取能力列表（降级方案）
   */
  private getAllCapabilitiesFromCache(filters?: {
    serviceName?: string;
    status?: McpCapabilityStatus;
    category?: string;
  }): McpCapabilityDto[] {
    const capabilities: McpCapabilityDto[] = [];

    this.capabilityDefinitions.forEach((def, serviceName) => {
      // 应用过滤器
      if (filters?.serviceName && serviceName !== filters.serviceName) {
        return;
      }
      if (filters?.category && def.category !== filters.category) {
        return;
      }

      const enabled = this.capabilityStatusCache.get(serviceName) ?? def.defaultEnabled ?? true;
      
      if (filters?.status) {
        const matchesStatus = filters.status === McpCapabilityStatus.ENABLED ? enabled : !enabled;
        if (!matchesStatus) {
          return;
        }
      }

      capabilities.push({
        serviceName,
        displayName: def.displayName,
        description: def.description || '', // 确保 description 字段始终存在
        enabled,
        tools: def.tools,
        category: def.category,
        authRequired: def.authRequired ?? false,
      });
    });

    return capabilities;
  }

  /**
   * 获取单个能力信息
   */
  async getCapability(serviceName: string): Promise<McpCapabilityDto | null> {
    try {
      const capability = await this.prisma.mcpCapability.findUnique({
        where: { serviceName },
      });

      if (!capability) {
        // 如果数据库中没有，检查定义
        const def = this.capabilityDefinitions.get(serviceName);
        if (!def) {
          return null;
        }
        // 返回默认值
      return {
        serviceName,
        displayName: def.displayName,
        description: def.description || '', // 确保 description 字段始终存在
        enabled: def.defaultEnabled ?? true,
        tools: def.tools,
        category: def.category,
        authRequired: def.authRequired ?? false,
      };
      }

      return {
        serviceName: capability.serviceName,
        displayName: capability.displayName,
        description: capability.description || '', // 确保 description 字段始终存在
        enabled: capability.enabled ?? false,
        tools: Array.isArray(capability.tools) ? capability.tools as string[] : [],
        category: capability.category || undefined,
        authRequired: capability.authRequired ?? false,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get capability: ${error.message}`, error.stack);
      // 降级到缓存
      const def = this.capabilityDefinitions.get(serviceName);
      if (!def) {
        return null;
      }
      const enabled = this.capabilityStatusCache.get(serviceName) ?? def.defaultEnabled ?? true;
      return {
        serviceName,
        displayName: def.displayName,
        description: def.description || '', // 确保 description 字段始终存在
        enabled,
        tools: def.tools,
        category: def.category,
        authRequired: def.authRequired ?? false,
      };
    }
  }

  /**
   * 检查能力是否启用（同步方法，优先使用缓存）
   */
  isCapabilityEnabled(serviceName: string): boolean {
    // 优先使用缓存（快速）
    if (this.capabilityStatusCache.has(serviceName)) {
      return this.capabilityStatusCache.get(serviceName) ?? true;
    }
    // 降级到默认值
    return this.capabilityDefinitions.get(serviceName)?.defaultEnabled ?? true;
  }

  /**
   * 检查能力是否启用（异步方法，从数据库查询）
   */
  async isCapabilityEnabledAsync(serviceName: string): Promise<boolean> {
    try {
      const capability = await this.prisma.mcpCapability.findUnique({
        where: { serviceName },
        select: { enabled: true },
      });
      
      if (capability) {
        // 更新缓存
        this.capabilityStatusCache.set(serviceName, capability.enabled ?? false);
        return capability.enabled ?? false;
      }
      
      // 如果数据库中没有，使用默认值
      const def = this.capabilityDefinitions.get(serviceName);
      const defaultEnabled = def?.defaultEnabled ?? true;
      this.capabilityStatusCache.set(serviceName, defaultEnabled);
      return defaultEnabled;
    } catch (error: any) {
      this.logger.error(`Failed to check capability status: ${error.message}`, error.stack);
      // 降级到缓存
      return this.isCapabilityEnabled(serviceName);
    }
  }

  /**
   * 启用能力
   */
  async enableCapability(serviceName: string): Promise<boolean> {
    if (!this.capabilityDefinitions.has(serviceName)) {
      this.logger.warn(`Unknown capability: ${serviceName}`);
      return false;
    }

    try {
      await this.prisma.mcpCapability.update({
        where: { serviceName },
        data: { enabled: true },
      });
      
      // 更新缓存
      this.capabilityStatusCache.set(serviceName, true);
      this.logger.log(`Enabled capability: ${serviceName}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to enable capability: ${error.message}`, error.stack);
      // 降级到内存更新
      this.capabilityStatusCache.set(serviceName, true);
      return true;
    }
  }

  /**
   * 禁用能力
   */
  async disableCapability(serviceName: string): Promise<boolean> {
    if (!this.capabilityDefinitions.has(serviceName)) {
      this.logger.warn(`Unknown capability: ${serviceName}`);
      return false;
    }

    try {
      await this.prisma.mcpCapability.update({
        where: { serviceName },
        data: { enabled: false },
      });
      
      // 更新缓存
      this.capabilityStatusCache.set(serviceName, false);
      this.logger.log(`Disabled capability: ${serviceName}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to disable capability: ${error.message}`, error.stack);
      // 降级到内存更新
      this.capabilityStatusCache.set(serviceName, false);
      return true;
    }
  }

  /**
   * 更新能力状态
   */
  async updateCapabilityStatus(serviceName: string, enabled: boolean): Promise<boolean> {
    if (enabled) {
      return await this.enableCapability(serviceName);
    } else {
      return await this.disableCapability(serviceName);
    }
  }

  /**
   * 批量更新能力状态
   */
  async batchUpdateCapabilityStatus(updates: Array<{ serviceName: string; enabled: boolean }>): Promise<{
    success: number;
    failed: number;
    results: Array<{ serviceName: string; success: boolean; error?: string }>;
  }> {
    let success = 0;
    let failed = 0;
    const results: Array<{ serviceName: string; success: boolean; error?: string }> = [];

    // 使用 Promise.allSettled 并行处理所有更新
    const promises = updates.map(async ({ serviceName, enabled }) => {
      try {
        const result = await this.updateCapabilityStatus(serviceName, enabled);
        if (result) {
          success++;
          return { serviceName, success: true };
        } else {
          failed++;
          return { serviceName, success: false, error: 'Unknown capability' };
        }
      } catch (error: any) {
        failed++;
        return { serviceName, success: false, error: error.message };
      }
    });

    const settledResults = await Promise.allSettled(promises);
    settledResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        failed++;
        results.push({ serviceName: 'unknown', success: false, error: result.reason?.message || 'Unknown error' });
      }
    });

    return { success, failed, results };
  }

  /**
   * 获取能力统计信息
   */
  async getStatistics(): Promise<{
    total: number;
    enabled: number;
    disabled: number;
    byCategory: Record<string, { total: number; enabled: number; disabled: number }>;
  }> {
    try {
      const capabilities = await this.prisma.mcpCapability.findMany({
        select: {
          enabled: true,
          category: true,
        },
      });

      const stats = {
        total: capabilities.length,
        enabled: 0,
        disabled: 0,
        byCategory: {} as Record<string, { total: number; enabled: number; disabled: number }>,
      };

      capabilities.forEach((cap) => {
        if (cap.enabled) {
          stats.enabled++;
        } else {
          stats.disabled++;
        }

        const category = cap.category || 'other';
        if (!stats.byCategory[category]) {
          stats.byCategory[category] = { total: 0, enabled: 0, disabled: 0 };
        }
        stats.byCategory[category].total++;
        if (cap.enabled) {
          stats.byCategory[category].enabled++;
        } else {
          stats.byCategory[category].disabled++;
        }
      });

      return stats;
    } catch (error: any) {
      this.logger.error(`Failed to get statistics: ${error.message}`, error.stack);
      // 降级到内存统计
      return this.getStatisticsFromCache();
    }
  }

  /**
   * 从缓存获取统计信息（降级方案）
   */
  private getStatisticsFromCache(): {
    total: number;
    enabled: number;
    disabled: number;
    byCategory: Record<string, { total: number; enabled: number; disabled: number }>;
  } {
    const stats = {
      total: this.capabilityDefinitions.size,
      enabled: 0,
      disabled: 0,
      byCategory: {} as Record<string, { total: number; enabled: number; disabled: number }>,
    };

    this.capabilityDefinitions.forEach((def, serviceName) => {
      const enabled = this.capabilityStatusCache.get(serviceName) ?? def.defaultEnabled ?? true;
      
      if (enabled) {
        stats.enabled++;
      } else {
        stats.disabled++;
      }

      const category = def.category || 'other';
      if (!stats.byCategory[category]) {
        stats.byCategory[category] = { total: 0, enabled: 0, disabled: 0 };
      }
      stats.byCategory[category].total++;
      if (enabled) {
        stats.byCategory[category].enabled++;
      } else {
        stats.byCategory[category].disabled++;
      }
    });

    return stats;
  }

  /**
   * 重置所有能力为默认状态
   */
  async resetToDefaults(): Promise<void> {
    try {
      // 批量更新数据库
      const updates = Array.from(this.capabilityDefinitions.entries()).map(([serviceName, def]) => ({
        where: { serviceName },
        data: { enabled: def.defaultEnabled ?? true },
      }));

      await Promise.all(
        updates.map(update =>
          this.prisma.mcpCapability.update(update).catch(() => {
            // 如果记录不存在，创建它
            const def = this.capabilityDefinitions.get(update.where.serviceName);
            if (def) {
              return this.prisma.mcpCapability.create({
                data: {
                  serviceName: update.where.serviceName,
                  displayName: def.displayName,
                  description: def.description,
                  enabled: def.defaultEnabled ?? true,
                  tools: def.tools,
                  category: def.category,
                  authRequired: def.authRequired ?? false,
                  defaultEnabled: def.defaultEnabled ?? true,
                },
              });
            }
          })
        )
      );

      // 更新缓存
      this.capabilityDefinitions.forEach((def, serviceName) => {
        this.capabilityStatusCache.set(serviceName, def.defaultEnabled ?? true);
      });

      this.logger.log('Reset all capabilities to default state');
    } catch (error: any) {
      this.logger.error(`Failed to reset capabilities: ${error.message}`, error.stack);
      // 降级到内存重置
      this.capabilityDefinitions.forEach((def, serviceName) => {
        this.capabilityStatusCache.set(serviceName, def.defaultEnabled ?? true);
      });
    }
  }
}
