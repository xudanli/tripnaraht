/**
 * Browserbase MCP Client
 * 
 * 用于在代码中直接使用 Browserbase MCP 服务的客户端类
 * 服务 URL: https://server.smithery.ai/@browserbasehq/mcp-browserbase
 * 
 * 使用 Smithery Connect API 连接，自动处理认证和配置
 * 需要设置环境变量: SMITHERY_API_KEY, BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createConnection, SmitheryAuthorizationError } from '@smithery/api/mcp';

export interface BrowserbaseCreateSessionParams {
  url?: string;
  userAgent?: string;
  viewport?: {
    width?: number;
    height?: number;
  };
}

export interface BrowserbaseCreateSessionResult {
  sessionId: string;
  url?: string;
}

export interface BrowserbaseNavigateParams {
  sessionId: string;
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

export interface BrowserbaseScreenshotParams {
  sessionId: string;
  fullPage?: boolean;
  quality?: number;
}

export interface BrowserbaseClickParams {
  sessionId: string;
  selector: string;
  waitForNavigation?: boolean;
}

export interface BrowserbaseEvaluateParams {
  sessionId: string;
  script: string;
}

export class BrowserbaseMcpClient {
  private client: Client | null = null;
  private transport: any = null;
  private connectionId: string | null = null;
  private isConnected: boolean = false;
  private readonly serverUrl: string;

  constructor(
    serverUrl?: string,
    private namespace?: string,
    private connectionIdOverride?: string
  ) {
    this.serverUrl = serverUrl || 'https://server.smithery.ai/@browserbasehq/mcp-browserbase';
  }

  /**
   * 连接到 Browserbase MCP 服务器（使用 Smithery Connect API）
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
        // 首次连接：使用 createConnection，它会自动创建 connection 和 namespace
        const connectionOptions: any = {
          mcpUrl: this.serverUrl,
        };
        
        // 只有在明确指定了 namespace 时才添加
        if (this.namespace) {
          connectionOptions.namespace = this.namespace;
        }
        
        // 添加 Browserbase 配置（如果环境变量已设置）
        const browserbaseApiKey = process.env.BROWSERBASE_API_KEY;
        const browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;
        
        if (browserbaseApiKey && browserbaseProjectId) {
          connectionOptions.config = {
            browserbaseApiKey,
            browserbaseProjectId,
          };
        }
        
        // createConnection 会自动处理 connection 创建和认证
        const result = await createConnection(connectionOptions);
        transport = result.transport;
        connectionId = result.connectionId;
      }

      // 保存 transport 和 connectionId
      this.transport = transport;
      this.connectionId = connectionId;

      this.client = new Client({
        name: 'tripnara-browserbase-client',
        version: '1.0.0',
      });

      await this.client.connect(transport);
      this.isConnected = true;
      console.log('✅ Browserbase MCP Client connected via Smithery Connect API');
      if (connectionId) {
        console.log(`   Connection ID: ${connectionId}`);
      }
    } catch (error: any) {
      if (error instanceof SmitheryAuthorizationError) {
        console.error('\n🔐 ============================================');
        console.error('Browserbase 认证');
        console.error('============================================');
        console.error('\n请访问以下 URL 完成 Browserbase 认证:');
        console.error(`\n${error.authorizationUrl}\n`);
        console.error('认证完成后，使用以下 connectionId 重新连接:');
        console.error(`connectionId: ${error.connectionId}\n`);
        console.error('============================================\n');
        
        // 保存 connectionId 供后续使用
        this.connectionId = error.connectionId;
        
        throw new Error(`OAuth authorization required. Visit: ${error.authorizationUrl}`);
      }
      
      if (error.message && error.message.includes('already started')) {
        if ((this.transport as any)?.started) {
          this.isConnected = true;
          console.log('✅ Browserbase MCP Client already connected');
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
    if (this.transport && typeof this.transport.close === 'function') {
      try {
        await this.transport.close();
      } catch (error: any) {
        // 忽略关闭错误
      }
    }
    this.transport = null;
    this.isConnected = false;
  }

  /**
   * 获取 Connection ID（用于后续重新连接）
   */
  getConnectionId(): string | null {
    return this.connectionId;
  }

  /**
   * 检查客户端是否已连接
   */
  isClientConnected(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * 列出所有可用工具
   */
  async listTools(): Promise<any[]> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const result = await this.client.listTools();
      return result.tools || [];
    } catch (error: any) {
      console.error('Failed to list tools:', error);
      throw error;
    }
  }

  /**
   * 创建浏览器会话
   */
  async createSession(params: BrowserbaseCreateSessionParams): Promise<BrowserbaseCreateSessionResult> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const result = await this.client.callTool({
        name: 'browserbase_session_create',
        arguments: params as any,
      });

      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const content = result.content[0];
        if (typeof content === 'object' && 'type' in content && 'text' in content) {
          const text = content.text;
          try {
            const parsed = JSON.parse(text);
            return parsed;
          } catch {
            // 如果不是 JSON，尝试直接返回
            return { sessionId: text } as any;
          }
        }
      }

      throw new Error('Invalid response format');
    } catch (error: any) {
      console.error('Failed to create session:', error);
      throw error;
    }
  }

  /**
   * 导航到 URL
   */
  async navigate(params: BrowserbaseNavigateParams): Promise<any> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const result = await this.client.callTool({
        name: 'browserbase_stagehand_navigate',
        arguments: params as any,
      });

      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const content = result.content[0];
        if (typeof content === 'object' && 'type' in content && 'text' in content) {
          const text = content.text;
          try {
            return JSON.parse(text);
          } catch {
            return { success: true, message: text };
          }
        }
      }

      return { success: true };
    } catch (error: any) {
      console.error('Failed to navigate:', error);
      throw error;
    }
  }

  /**
   * 截图
   */
  async screenshot(params: BrowserbaseScreenshotParams): Promise<{ image: string; base64?: string }> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const result = await this.client.callTool({
        name: 'browserbase_screenshot',
        arguments: params as any,
      });

      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const content = result.content[0];
        if (typeof content === 'object' && 'type' in content && 'text' in content) {
          const text = content.text;
          try {
            const parsed = JSON.parse(text);
            return parsed;
          } catch {
            return { image: text };
          }
        }
      }

      throw new Error('Invalid response format');
    } catch (error: any) {
      console.error('Failed to take screenshot:', error);
      throw error;
    }
  }

  /**
   * 点击元素（使用 stagehand_act）
   */
  async click(params: BrowserbaseClickParams): Promise<any> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      // browserbase_stagehand_act 用于执行操作（点击、输入等）
      // action 应该是描述性的，例如 "Click the sign in button"
      const result = await this.client.callTool({
        name: 'browserbase_stagehand_act',
        arguments: {
          action: `Click on element with selector: ${params.selector}`,
        },
      });

      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const content = result.content[0];
        if (typeof content === 'object' && 'type' in content && 'text' in content) {
          const text = content.text;
          try {
            return JSON.parse(text);
          } catch {
            return { success: true, message: text };
          }
        }
      }

      return { success: true };
    } catch (error: any) {
      console.error('Failed to click:', error);
      throw error;
    }
  }

  /**
   * 执行 JavaScript（使用 stagehand_extract 提取信息）
   */
  async evaluate(params: BrowserbaseEvaluateParams): Promise<any> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      // browserbase_stagehand_extract 用于提取页面信息
      // instruction 应该是描述性的，说明要提取什么信息
      const result = await this.client.callTool({
        name: 'browserbase_stagehand_extract',
        arguments: {
          instruction: params.script || 'Extract information from the page',
        },
      });

      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const content = result.content[0];
        if (typeof content === 'object' && 'type' in content && 'text' in content) {
          const text = content.text;
          try {
            return JSON.parse(text);
          } catch {
            return { result: text };
          }
        }
      }

      return { result: null };
    } catch (error: any) {
      console.error('Failed to evaluate:', error);
      throw error;
    }
  }
}
