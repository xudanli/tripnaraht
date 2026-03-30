/**
 * Browserbase MCP Service
 * 
 * NestJS 服务层，封装 Browserbase MCP 客户端
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { BrowserbaseMcpClient } from './browserbase-mcp-client';

@Injectable()
export class BrowserbaseMcpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserbaseMcpService.name);
  private client: BrowserbaseMcpClient | null = null;

  constructor() {
    try {
      const serverUrl = process.env.BROWSERBASE_MCP_SERVER_URL || 
                       'https://server.smithery.ai/@browserbasehq/mcp-browserbase';
      const namespace = process.env.BROWSERBASE_MCP_NAMESPACE;
      const connectionId = process.env.BROWSERBASE_MCP_CONNECTION_ID;
      this.client = new BrowserbaseMcpClient(serverUrl, namespace, connectionId);
      this.logger.log('✅ Browserbase MCP Service initialized');
      if (connectionId) {
        this.logger.log(`   Using connection ID: ${connectionId}`);
      }
    } catch (error: any) {
      this.logger.warn(`⚠️  Failed to initialize Browserbase MCP client: ${error.message}`);
      this.client = null;
    }
  }

  async onModuleInit() {
    // 延迟连接，避免启动时阻塞
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (error: any) {
        this.logger.warn(`Failed to disconnect Browserbase MCP client: ${error.message}`);
      }
    }
  }

  /**
   * 确保客户端已连接
   */
  private async ensureConnected(): Promise<void> {
    if (!this.client) {
      throw new Error('Browserbase MCP client is not available');
    }

    // 如果已连接，先断开以确保使用最新的工具列表
    if (this.client.isClientConnected()) {
      try {
        await this.client.disconnect();
      } catch (error: any) {
        this.logger.debug('Failed to disconnect before reconnect:', error.message);
      }
    }

    if (!this.client.isClientConnected()) {
      try {
        await this.client.connect();
      } catch (error: any) {
        if (error.message && error.message.includes('already started')) {
          this.logger.debug('Browserbase MCP transport already started, reusing connection');
          return;
        }
        // 如果是 OAuth 授权错误，提供更友好的错误信息
        if (error.message && error.message.includes('OAuth authorization required')) {
          const connectionId = this.client.getConnectionId();
          if (connectionId) {
            this.logger.warn(`⚠️  OAuth authorization required. Connection ID: ${connectionId}`);
            this.logger.warn(`   请访问授权 URL 完成授权，然后将 connectionId 保存到环境变量 BROWSERBASE_MCP_CONNECTION_ID`);
          }
        }
        throw error;
      }
    }
  }

  /**
   * 创建浏览器会话
   */
  async createSession(params: {
    url?: string;
    userAgent?: string;
    viewport?: { width?: number; height?: number };
  }): Promise<any> {
    await this.ensureConnected();
    
    if (!this.client) {
      throw new Error('Browserbase MCP client is not available');
    }

    try {
      return await this.client.createSession(params);
    } catch (error: any) {
      this.logger.error(`Browserbase create session failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 导航到 URL
   */
  async navigate(params: {
    sessionId: string;
    url: string;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  }): Promise<any> {
    await this.ensureConnected();
    
    if (!this.client) {
      throw new Error('Browserbase MCP client is not available');
    }

    try {
      return await this.client.navigate(params);
    } catch (error: any) {
      this.logger.error(`Browserbase navigate failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 截图
   */
  async screenshot(params: {
    sessionId: string;
    fullPage?: boolean;
    quality?: number;
  }): Promise<any> {
    await this.ensureConnected();
    
    if (!this.client) {
      throw new Error('Browserbase MCP client is not available');
    }

    try {
      return await this.client.screenshot(params);
    } catch (error: any) {
      this.logger.error(`Browserbase screenshot failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 点击元素
   */
  async click(params: {
    sessionId: string;
    selector: string;
    waitForNavigation?: boolean;
  }): Promise<any> {
    await this.ensureConnected();
    
    if (!this.client) {
      throw new Error('Browserbase MCP client is not available');
    }

    try {
      return await this.client.click(params);
    } catch (error: any) {
      this.logger.error(`Browserbase click failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 执行 JavaScript
   */
  async evaluate(params: {
    sessionId: string;
    script: string;
  }): Promise<any> {
    await this.ensureConnected();
    
    if (!this.client) {
      throw new Error('Browserbase MCP client is not available');
    }

    try {
      return await this.client.evaluate(params);
    } catch (error: any) {
      this.logger.error(`Browserbase evaluate failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 列出所有可用的工具
   */
  async listTools(): Promise<any[]> {
    await this.ensureConnected();
    
    if (!this.client) {
      throw new Error('Browserbase MCP client is not available');
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

  /**
   * 获取授权 URL 和 connectionId
   */
  async getAuthorizationUrl(): Promise<{
    authorizationUrl: string;
    connectionId: string;
  }> {
    try {
      // 创建临时客户端以获取授权 URL
      const serverUrl = process.env.BROWSERBASE_MCP_SERVER_URL || 
                       'https://server.smithery.ai/@browserbasehq/mcp-browserbase';
      const tempClient = new BrowserbaseMcpClient(serverUrl);
      
      try {
        await tempClient.connect();
        // 如果连接成功，说明已经授权
        const connectionId = tempClient.getConnectionId();
        if (connectionId) {
          return {
            authorizationUrl: '',
            connectionId: connectionId,
          };
        }
        throw new Error('Already authorized but no connectionId found');
      } catch (error: any) {
        if (error.message && error.message.includes('OAuth authorization required')) {
          const authUrl = error.message.split('Visit: ')[1] || '';
          const connectionId = tempClient.getConnectionId();
          
          if (!connectionId) {
            throw new Error('Failed to get connectionId');
          }

          return {
            authorizationUrl: authUrl,
            connectionId: connectionId,
          };
        }
        throw error;
      }
    } catch (error: any) {
      this.logger.error('Get authorization URL failed:', error);
      throw error;
    }
  }

  /**
   * 验证授权是否完成
   */
  async verifyAuthorization(connectionId: string): Promise<{
    isAuthorized: boolean;
    message?: string;
  }> {
    try {
      // 使用提供的 connectionId 创建客户端
      const serverUrl = process.env.BROWSERBASE_MCP_SERVER_URL || 
                       'https://server.smithery.ai/@browserbasehq/mcp-browserbase';
      const testClient = new BrowserbaseMcpClient(serverUrl, undefined, connectionId);
      
      try {
        await testClient.connect();
        // 如果连接成功，说明授权已完成
        return {
          isAuthorized: true,
          message: 'Authorization verified successfully',
        };
      } catch (error: any) {
        if (error.message && error.message.includes('OAuth authorization required')) {
          return {
            isAuthorized: false,
            message: 'Authorization not completed yet',
          };
        }
        throw error;
      }
    } catch (error: any) {
      this.logger.error('Verify authorization failed:', error);
      return {
        isAuthorized: false,
        message: error.message || 'Failed to verify authorization',
      };
    }
  }
}
