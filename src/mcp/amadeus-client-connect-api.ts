/**
 * Amadeus MCP Client using Smithery Connect API
 * 
 * 使用 Smithery Connect API 的 Amadeus MCP 客户端
 * 这种方式更可靠，自动处理 OAuth 和客户端注册
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createConnection, SmitheryAuthorizationError } from '@smithery/api/mcp';
import { Smithery } from '@smithery/api';

/**
 * Amadeus MCP 客户端（使用 Connect API）
 * 
 * 需要设置环境变量: SMITHERY_API_KEY
 * 获取 API Key: https://smithery.ai/account/api-keys
 */
export class AmadeusMcpClientConnectAPI {
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
   * 连接到 Amadeus MCP 服务器
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      let transport: any;
      let connectionId: string;
      
      // 如果提供了 connectionId，检查是否需要重新创建（如果有凭证但旧连接可能没有配置）
      const clientId = process.env.AMADEUS_CLIENT_ID || process.env.AMADEUS_API_KEY;
      const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.AMADEUS_API_SECRET;
      const hasCredentials = !!(clientId && clientSecret);
      
      if (this.connectionIdOverride && !hasCredentials) {
        // 没有凭证，直接使用旧连接
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
        // 首次连接或需要重新创建（有凭证但旧连接可能没有配置）
        // 首次连接：需要先创建 connection（支持传递配置）
        const smithery = new Smithery();
        
        // 解析 namespace（如果没有指定，让 SDK 自动处理）
        let namespace: string;
        if (this.namespace) {
          namespace = this.namespace;
        } else {
          // 自动获取或创建 namespace
          const { namespaces } = await smithery.namespaces.list();
          if (namespaces.length > 0) {
            namespace = namespaces[0].name;
          } else {
            const { name } = await smithery.namespaces.create();
            namespace = name;
          }
        }
        
        // 准备连接配置
        // 根据 smithery.yaml，服务器定义了配置 schema，应该通过 config 对象传递
        // Smithery Connect API 会将 config 对象转换为查询参数传递给服务器
        const mcpUrl = 'https://server.smithery.ai/@almogqwinz/mcp-amadeus-api';
        const connectionConfig: any = {
          mcpUrl,
        };
        
        // 如果设置了 Amadeus API 凭证，通过 config 对象传递配置
        // 根据 smithery.yaml，字段名应该是：amadeusClientId, amadeusClientSecret, amadeusHostname
        if (hasCredentials && clientId && clientSecret) {
          const hostname = process.env.AMADEUS_HOSTNAME || 
                          (process.env.AMADEUS_BASE_URL === 'test.api.amadeus.com' ? 'test' : 'test');
          
          // 通过 config 对象传递配置（Smithery Connect API 会自动处理）
          connectionConfig.config = {
            amadeusClientId: clientId,
            amadeusClientSecret: clientSecret,
            amadeusHostname: hostname,
          };
          
          console.log(`[AmadeusClient] Creating connection with config object`);
          console.log(`[AmadeusClient] Config: amadeusClientId, amadeusClientSecret, amadeusHostname=${hostname}`);
        } else {
          console.log('[AmadeusClient] No credentials found, creating connection without config');
        }
        
        // 如果有旧的 connectionId 但需要重新创建（因为有凭证），先删除旧连接
        if (this.connectionIdOverride && hasCredentials) {
          try {
            await smithery.experimental.connect.connections.delete(this.connectionIdOverride, { namespace });
            console.log(`Deleted old connection ${this.connectionIdOverride} to recreate with config`);
          } catch (error) {
            // 忽略删除错误（连接可能不存在）
          }
        }
        
        // 创建 connection（使用 experimental API）
        const conn = await smithery.experimental.connect.connections.create(namespace, connectionConfig);
        connectionId = conn.connectionId;
        
        // 检查连接状态
        console.log(`[AmadeusClient] Connection created: ${connectionId}, status: ${conn.status?.state || 'unknown'}`);
        if (conn.status) {
          if (conn.status.state === 'auth_required') {
            const authUrl = (conn.status as any).authorizationUrl;
            if (authUrl) {
              throw new SmitheryAuthorizationError(
                `MCP server requires authorization. Please visit: ${authUrl}`,
                authUrl,
                connectionId,
              );
            }
            throw new Error('MCP server requires authorization.');
          }
          if (conn.status.state === 'error') {
            const errorMsg = (conn.status as any).message || 'Unknown error';
            console.log(`[AmadeusClient] Connection error: ${errorMsg}`);
            throw new Error(`MCP connection failed: ${errorMsg}`);
          }
          if (conn.status.state === 'connected') {
            console.log(`[AmadeusClient] Connection is connected, config should be applied`);
          }
        }
        
        // 连接成功，获取 transport
        // 注意：使用 connectionId 重新连接时，配置应该已经存储在连接中
        const result = await createConnection({
          connectionId,
          namespace,
        });
        transport = result.transport;
        console.log(`[AmadeusClient] Got transport for connection ${connectionId}`);
      }

      // 保存 transport 和 connectionId
      this.transport = transport;
      this.connectionId = connectionId;

      // 创建 MCP 客户端并连接
      this.client = new Client({
        name: 'tripnara-amadeus-client',
        version: '1.0.0',
      });

      await this.client.connect(transport);
      this.isConnected = true;
      console.log('✅ Connected to Amadeus MCP server via Connect API');
    } catch (error) {
      if (error instanceof SmitheryAuthorizationError) {
        console.error('\n🔐 ============================================');
        console.error('Amadeus 认证');
        console.error('============================================');
        console.error('\n请访问以下 URL 完成 Amadeus 认证:');
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
      
      const result = await createConnection(connectionOptions);
      this.transport = result.transport;
      this.connectionId = connectionId;

      this.client = new Client({
        name: 'tripnara-amadeus-client',
        version: '1.0.0',
      });

      await this.client.connect(this.transport);
      this.isConnected = true;
      console.log('✅ Reconnected to Amadeus MCP server');
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
      console.log('✅ Disconnected from Amadeus MCP server');
    } catch (error) {
      console.error('❌ Failed to disconnect:', error);
    }
  }

  /**
   * 列出所有可用工具
   */
  async listTools() {
    await this.ensureConnected();
    return await this.client!.listTools();
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: Record<string, any>) {
    await this.ensureConnected();
    return await this.client!.callTool({
      name,
      arguments: args,
    });
  }

  /**
   * 获取 connectionId
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
