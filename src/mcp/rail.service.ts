/**
 * Rail Service
 * 
 * NestJS 服务层，封装 Rail MCP 客户端
 * 提供铁路查询、时刻表、预订等功能
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { RailMcpClient, getRailClient } from './rail-client';

@Injectable()
export class RailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RailService.name);
  private client: RailMcpClient | null = null;
  private isConnected = false;

  constructor() {
    try {
      this.client = getRailClient();
      this.logger.log('✅ Rail Service initialized');
    } catch (error: any) {
      this.logger.warn(`⚠️  Failed to initialize Rail client: ${error.message}`);
      this.client = null;
    }
  }

  async onModuleInit() {
    // 延迟连接，避免启动时阻塞
    // 实际连接会在第一次使用时建立
  }

  async onModuleDestroy() {
    if (this.client && this.isConnected) {
      try {
        await this.client.disconnect();
        this.isConnected = false;
        this.logger.log('✅ Rail client disconnected');
      } catch (error: any) {
        this.logger.warn(`Failed to disconnect Rail client: ${error.message}`);
      }
    }
  }

  /**
   * 确保客户端已连接
   */
  private async ensureConnected(): Promise<void> {
    if (!this.client) {
      throw new Error('Rail client not initialized');
    }

    if (!this.isConnected) {
      try {
        await this.client.connect();
        this.isConnected = true;
        this.logger.debug('✅ Rail client connected');
      } catch (error: any) {
        this.logger.error(`Failed to connect Rail client: ${error.message}`);
        throw new Error(`Rail MCP connection failed: ${error.message}`);
      }
    }
  }

  /**
   * 搜索铁路路线
   */
  async searchRoutes(params: {
    origin: string;
    destination: string;
    date?: string;
  }): Promise<any> {
    await this.ensureConnected();

    try {
      // Rail MCP 工具是动态的，先尝试调用 searchRoutes
      const result = await this.client!.callTool('searchRoutes', {
        origin: params.origin,
        destination: params.destination,
        date: params.date,
      });

      return result;
    } catch (error: any) {
      this.logger.error(`Rail searchRoutes failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取时刻表
   */
  async getSchedule(params: {
    origin: string;
    destination: string;
    date: string;
  }): Promise<any> {
    await this.ensureConnected();

    try {
      // 尝试调用 getSchedule 或类似工具
      const result = await this.client!.callTool('getSchedule', {
        origin: params.origin,
        destination: params.destination,
        date: params.date,
      });

      return result;
    } catch (error: any) {
      // 如果 getSchedule 不存在，尝试 searchRoutes
      this.logger.debug(`getSchedule not available, trying searchRoutes`);
      return this.searchRoutes({
        origin: params.origin,
        destination: params.destination,
        date: params.date,
      });
    }
  }

  /**
   * 检查服务是否可用
   */
  isServiceAvailable(): boolean {
    return this.client !== null && process.env.ENABLE_RAIL_MCP !== 'false';
  }

  /**
   * 列出可用工具
   */
  async listTools(): Promise<string[]> {
    await this.ensureConnected();

    try {
      const tools = await this.client!.listTools();
      return (tools.tools || []).map((tool: any) => tool.name);
    } catch (error: any) {
      this.logger.error(`Failed to list Rail tools: ${error.message}`);
      return [];
    }
  }
}
