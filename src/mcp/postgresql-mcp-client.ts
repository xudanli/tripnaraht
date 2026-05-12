/**
 * PostgreSQL MCP Client
 * 
 * 用于在代码中直接使用 PostgreSQL MCP 服务的客户端类
 * 服务 URL: https://server.smithery.ai/1Levick3/postgresql-mcp-server
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface PostgreSQLQueryParams {
  query: string;
  params?: any[];
}

export interface PostgreSQLQueryResult {
  rows: any[];
  rowCount: number;
  columns?: string[];
}

export interface PostgreSQLExecuteParams {
  query: string;
  params?: any[];
}

export interface PostgreSQLExecuteResult {
  rowCount: number;
  lastInsertId?: string;
}

export class PostgreSQLMcpClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private isConnected: boolean = false;
  private readonly serverUrl: string;

  constructor(serverUrl?: string) {
    this.serverUrl = serverUrl || 'https://server.smithery.ai/1Levick3/postgresql-mcp-server';
  }

  /**
   * 连接到 PostgreSQL MCP 服务器
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      this.transport = new StreamableHTTPClientTransport(
        new URL(this.serverUrl),
        {}
      );

      this.client = new Client(
        {
          name: 'tripnara-postgresql-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      await this.client.connect(this.transport);
      this.isConnected = true;
      console.log('✅ PostgreSQL MCP Client connected');
    } catch (error: any) {
      // 检查是否是"already started"错误
      if (error.message && error.message.includes('already started')) {
        // 检查 transport 是否已经启动
        if ((this.transport as any)?.started) {
          this.isConnected = true;
          console.log('✅ PostgreSQL MCP Client already connected');
          return;
        }
      }
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
      } catch (error: any) {
        // 忽略关闭错误
      }
      this.client = null;
    }
    this.transport = null;
    this.isConnected = false;
  }

  /**
   * 执行 SQL 查询（SELECT）
   */
  async query(params: PostgreSQLQueryParams): Promise<PostgreSQLQueryResult> {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }

    try {
      const result = await this.client!.callTool({
        name: 'query',
        arguments: {
          query: params.query,
          params: params.params || [],
        },
      });

      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const content = result.content[0];
        if (content && typeof content === 'object' && 'type' in content && content.type === 'text' && 'text' in content) {
          try {
            const data = JSON.parse(content.text);
            return {
              rows: data.rows || data || [],
              rowCount: data.rowCount || (Array.isArray(data) ? data.length : 0),
              columns: data.columns,
            };
          } catch (parseError) {
            // 如果不是 JSON，直接返回文本内容
            return {
              rows: [{ result: content.text }],
              rowCount: 1,
              columns: ['result'],
            };
          }
        }
      }

      throw new Error('Invalid response format from PostgreSQL MCP server');
    } catch (error: any) {
      throw new Error(`PostgreSQL query failed: ${error.message}`);
    }
  }

  /**
   * 执行 SQL 命令（INSERT, UPDATE, DELETE）
   */
  async execute(params: PostgreSQLExecuteParams): Promise<PostgreSQLExecuteResult> {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }

    try {
      const result = await this.client!.callTool({
        name: 'execute',
        arguments: {
          query: params.query,
          params: params.params || [],
        },
      });

      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const content = result.content[0];
        if (content && typeof content === 'object' && 'type' in content && content.type === 'text' && 'text' in content) {
          try {
            const data = JSON.parse(content.text);
            return {
              rowCount: data.rowCount || data.affectedRows || 0,
              lastInsertId: data.lastInsertId || data.insertId,
            };
          } catch (parseError) {
            // 如果不是 JSON，尝试解析文本
            return {
              rowCount: 0,
              lastInsertId: undefined,
            };
          }
        }
      }

      throw new Error('Invalid response format from PostgreSQL MCP server');
    } catch (error: any) {
      throw new Error(`PostgreSQL execute failed: ${error.message}`);
    }
  }

  /**
   * 列出所有可用的工具
   */
  async listTools(): Promise<any[]> {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }

    try {
      const tools = await this.client!.listTools();
      return tools.tools || [];
    } catch (error: any) {
      throw new Error(`Failed to list tools: ${error.message}`);
    }
  }

  /**
   * 检查连接状态
   */
  isClientConnected(): boolean {
    return this.isConnected && this.client !== null;
  }
}
