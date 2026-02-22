/**
 * Airbnb MCP Client using Smithery Connect API
 * 
 * 使用 Smithery Connect API 的 Airbnb MCP 客户端
 * 这种方式更可靠，自动处理 OAuth 和客户端注册
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createConnection, SmitheryAuthorizationError } from '@smithery/api/mcp';
import { Smithery } from '@smithery/api';

/**
 * Airbnb MCP 客户端（使用 Connect API）
 * 
 * 需要设置环境变量: SMITHERY_API_KEY
 * 获取 API Key: https://smithery.ai/account/api-keys
 */
export class AirbnbMcpClientConnectAPI {
  private client: Client | null = null;
  private transport: any = null;
  private connectionId: string | null = null;
  private isConnected: boolean = false;

  constructor(
    private namespace?: string,
    private connectionIdOverride?: string
  ) {
    // 如果不指定 namespace，Connect API 会自动使用第一个已存在的 namespace 或创建一个新的
    // 这样可以避免 namespace 不存在的问题
  }

  /**
   * 连接到 Airbnb MCP 服务器
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      let transport: any;
      let connectionId: string;
      
      // 如果提供了 connectionId，直接使用它重新连接
      if (this.connectionIdOverride) {
        const connectionOptions: any = {
          connectionId: this.connectionIdOverride,
        };
        
        if (this.namespace) {
          connectionOptions.namespace = this.namespace;
        }
        
        const result = await createConnection(connectionOptions);
        transport = result.transport;
        connectionId = this.connectionIdOverride;
      } else {
        // 首次连接：直接使用 createConnection，它会自动创建 connection 和 namespace
        const connectionOptions: any = {
          mcpUrl: 'https://server.smithery.ai/iclickfreedownloads/mcp-server-airbnb',
        };
        
        // 只有在明确指定了 namespace 时才添加
        if (this.namespace) {
          connectionOptions.namespace = this.namespace;
        }
        
        // createConnection 会自动处理 connection 创建和 OAuth
        const result = await createConnection(connectionOptions);
        transport = result.transport;
        connectionId = result.connectionId;
      }

      // 保存 transport 和 connectionId
      this.transport = transport;
      this.connectionId = connectionId;

      this.client = new Client({
        name: 'tripnara-airbnb-client',
        version: '1.0.0',
      });

      await this.client.connect(transport);
      this.isConnected = true;
      console.log('✅ Connected to Airbnb MCP server via Connect API');
    } catch (error) {
      if (error instanceof SmitheryAuthorizationError) {
        console.error('\n🔐 ============================================');
        console.error('Airbnb 认证');
        console.error('============================================');
        console.error('\n请访问以下 URL 完成 Airbnb 认证:');
        console.error(`\n${error.authorizationUrl}\n`);
        console.error('认证完成后，使用以下 connectionId 重新连接:');
        console.error(`connectionId: ${error.connectionId}\n`);
        console.error('============================================\n');
        
        // 保存 connectionId 供后续使用
        this.connectionId = error.connectionId;
        
        throw new Error(`OAuth authorization required. Visit: ${error.authorizationUrl}`);
      }
      
      console.error('❌ Failed to connect:', error);
      throw error;
    }
  }

  /**
   * 使用已保存的 connectionId 重新连接（认证完成后）
   */
  async reconnect(connectionId: string): Promise<void> {
    try {
      const connectionOptions: any = {
        connectionId,
      };
      
      // 只有在提供了 namespace 时才添加
      if (this.namespace) {
        connectionOptions.namespace = this.namespace;
      }
      
      const { transport } = await createConnection(connectionOptions);

      this.transport = transport;
      this.connectionId = connectionId;

      this.client = new Client({
        name: 'tripnara-airbnb-client',
        version: '1.0.0',
      });

      await this.client.connect(transport);
      this.isConnected = true;
      console.log('✅ Reconnected to Airbnb MCP server');
    } catch (error) {
      console.error('❌ Failed to reconnect:', error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.client) {
      return;
    }

    try {
      await this.client.close();
      this.isConnected = false;
      console.log('✅ Disconnected from Airbnb MCP server');
    } catch (error) {
      console.error('❌ Failed to disconnect:', error);
    }
  }

  /**
   * 列出所有可用工具
   */
  async listTools(): Promise<any> {
    await this.ensureConnected();
    return await this.client!.listTools();
  }

  /**
   * 调用工具（通用方法）
   */
  async callTool(name: string, arguments_: Record<string, any> = {}): Promise<any> {
    await this.ensureConnected();
    return await this.client!.callTool({
      name,
      arguments: arguments_,
    });
  }

  /**
   * 获取 connectionId（用于保存和后续使用）
   */
  getConnectionId(): string | null {
    return this.connectionId;
  }

  /**
   * 确保已连接
   */
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected || !this.client) {
      await this.connect();
    }
  }
}
