/**
 * Exa MCP Client
 * 
 * 使用 StreamableHTTPClientTransport 直接连接到 Exa MCP 服务器
 * 服务器 URL: https://mcp.exa.ai/mcp
 * 
 * 需要设置环境变量: EXA_API_KEY
 * 获取 API Key: https://dashboard.exa.ai/api-keys
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export class ExaMcpClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private isConnected: boolean = false;

  constructor(private serverUrl: string = 'https://mcp.exa.ai/mcp') {}

  /**
   * 连接到 Exa MCP 服务器
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      // Exa MCP 服务器使用 HTTP 传输
      // API Key 通过 URL 查询参数传递（根据 Exa 文档：https://docs.exa.ai/reference/exa-mcp）
      const apiKey = process.env.EXA_API_KEY;
      
      // 如果提供了 API Key，将其添加到 URL 查询参数中
      // 参数名必须是 exaApiKey（不是 api_key）
      let serverUrl = this.serverUrl;
      if (apiKey) {
        const url = new URL(serverUrl);
        url.searchParams.set('exaApiKey', apiKey);
        serverUrl = url.toString();
      }

      // StreamableHTTPClientTransport 不支持 headers 选项
      // 如果需要 header 认证，可能需要使用 fetch 直接调用或创建自定义 transport
      this.transport = new StreamableHTTPClientTransport(
        new URL(serverUrl)
      );

      this.client = new Client({
        name: 'tripnara-exa-client',
        version: '1.0.0',
      });

      await this.client.connect(this.transport);
      this.isConnected = true;
      console.log('✅ Connected to Exa MCP server');
    } catch (error) {
      console.error('❌ Failed to connect to Exa MCP:', error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.error('Error closing client:', error);
      }
      this.client = null;
    }
    this.transport = null;
    this.isConnected = false;
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }

    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const result = await this.client.callTool({
      name,
      arguments: args,
    });

    return result;
  }

  /**
   * 列出所有可用工具
   */
  async listTools(): Promise<any[]> {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }

    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const tools = await this.client.listTools();
    return tools.tools;
  }

  /**
   * 检查连接状态
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }
}
