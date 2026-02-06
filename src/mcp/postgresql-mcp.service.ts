/**
 * PostgreSQL MCP Service
 * 
 * NestJS 服务层，封装 PostgreSQL MCP 客户端
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { PostgreSQLMcpClient } from './postgresql-mcp-client';
import { PostgreSQLMcpSecurityService } from './services/postgresql-mcp-security.service';
import { PostgreSQLMcpMonitoringService } from './services/postgresql-mcp-monitoring.service';

@Injectable()
export class PostgreSQLMcpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostgreSQLMcpService.name);
  private client: PostgreSQLMcpClient | null = null;

  constructor(
    private readonly securityService: PostgreSQLMcpSecurityService,
    @Optional() private readonly monitoringService?: PostgreSQLMcpMonitoringService,
  ) {
    try {
      const serverUrl = process.env.POSTGRESQL_MCP_SERVER_URL || 
                       'https://server.smithery.ai/1Levick3/postgresql-mcp-server';
      this.client = new PostgreSQLMcpClient(serverUrl);
      this.logger.log('✅ PostgreSQL MCP Service initialized');
    } catch (error: any) {
      this.logger.warn(`⚠️  Failed to initialize PostgreSQL MCP client: ${error.message}`);
      this.client = null;
    }
  }

  async onModuleInit() {
    // 延迟连接，避免启动时阻塞
    // 实际连接会在第一次使用时建立
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (error: any) {
        this.logger.warn(`Failed to disconnect PostgreSQL MCP client: ${error.message}`);
      }
    }
  }

  /**
   * 确保客户端已连接
   */
  private async ensureConnected(): Promise<void> {
    if (!this.client) {
      throw new Error('PostgreSQL MCP client is not available');
    }

    if (!this.client.isClientConnected()) {
      try {
        await this.client.connect();
      } catch (error: any) {
        // 处理"already started"错误
        if (error.message && error.message.includes('already started')) {
          this.logger.debug('PostgreSQL MCP transport already started, reusing connection');
          return;
        }
        throw error;
      }
    }
  }

  /**
   * 执行 SQL 查询（SELECT）
   */
  async query(query: string, params?: any[]): Promise<any> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;
    let rowCount: number | undefined;

    try {
      // 1. 安全检查
      const securityCheck = this.securityService.checkSQLSafety(query, params);
      if (securityCheck.blocked) {
        throw new Error(`SQL 查询被安全策略阻止: ${securityCheck.warnings.join(', ')}`);
      }

      if (!securityCheck.isSafe) {
        this.logger.warn(`SQL 查询存在安全风险 (${securityCheck.riskLevel}): ${securityCheck.warnings.join(', ')}`);
      }

      // 2. 参数验证
      const paramValidation = this.securityService.validateParameters(query, params);
      if (!paramValidation.isValid) {
        throw new Error(`参数验证失败: ${paramValidation.error}`);
      }

      // 3. 执行查询
      await this.ensureConnected();
      
      if (!this.client) {
        throw new Error('PostgreSQL MCP client is not available');
      }

      const result = await this.client.query({ query, params });
      success = true;
      rowCount = Array.isArray(result) ? result.length : undefined;

      return result;
    } catch (err: any) {
      error = err.message || 'Unknown error';
      this.logger.error(`PostgreSQL query failed: ${error}`);
      throw err;
    } finally {
      // 4. 记录监控指标
      if (this.monitoringService) {
        const executionTime = Date.now() - startTime;
        await this.monitoringService.recordQueryMetrics({
          query,
          params,
          executionTime,
          timestamp: new Date(),
          success,
          error,
          rowCount,
        });
      }
    }
  }

  /**
   * 执行 SQL 命令（INSERT, UPDATE, DELETE）
   */
  async execute(query: string, params?: any[]): Promise<any> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;
    let rowCount: number | undefined;

    try {
      // 1. 安全检查（写操作需要更严格的检查）
      const securityCheck = this.securityService.checkSQLSafety(query, params);
      if (securityCheck.blocked || !securityCheck.isSafe) {
        throw new Error(`SQL 命令被安全策略阻止: ${securityCheck.warnings.join(', ')}`);
      }

      // 2. 参数验证
      const paramValidation = this.securityService.validateParameters(query, params);
      if (!paramValidation.isValid) {
        throw new Error(`参数验证失败: ${paramValidation.error}`);
      }

      // 3. 执行命令
      await this.ensureConnected();
      
      if (!this.client) {
        throw new Error('PostgreSQL MCP client is not available');
      }

      const result = await this.client.execute({ query, params });
      success = true;
      rowCount = result?.rowCount;

      return result;
    } catch (err: any) {
      error = err.message || 'Unknown error';
      this.logger.error(`PostgreSQL execute failed: ${error}`);
      throw err;
    } finally {
      // 4. 记录监控指标
      if (this.monitoringService) {
        const executionTime = Date.now() - startTime;
        await this.monitoringService.recordQueryMetrics({
          query,
          params,
          executionTime,
          timestamp: new Date(),
          success,
          error,
          rowCount,
        });
      }
    }
  }

  /**
   * 列出所有可用的工具
   */
  async listTools(): Promise<any[]> {
    await this.ensureConnected();
    
    if (!this.client) {
      throw new Error('PostgreSQL MCP client is not available');
    }

    try {
      return await this.client.listTools();
    } catch (error: any) {
      this.logger.error(`Failed to list tools: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查服务是否可用
   */
  isAvailable(): boolean {
    return this.client !== null;
  }
}
