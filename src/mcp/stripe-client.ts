/**
 * Stripe MCP Client
 * 
 * 客户端连接到 Stripe MCP 服务
 * 提供支付处理、支付意图创建、退款等功能
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformation, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * 文件系统 OAuth Provider（用于服务器端应用）
 */
export class StripeOAuthProvider implements OAuthClientProvider {
  private tokenFile: string;
  private clientInfoFile: string;
  private codeVerifierFile: string;
  private configDir: string;

  constructor(private serverUrl: string, private clientName: string = 'TripNara Stripe Client') {
    // 创建配置目录
    const homeDir = os.homedir();
    this.configDir = path.join(homeDir, '.tripnara-mcp');
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // 使用服务器名称作为文件名的一部分
    const serverName = serverUrl.split('/').pop() || 'stripe';
    this.tokenFile = path.join(this.configDir, `${serverName}-tokens.json`);
    this.clientInfoFile = path.join(this.configDir, `${serverName}-client-info.json`);
    this.codeVerifierFile = path.join(this.configDir, `${serverName}-code-verifier.txt`);
  }

  get redirectUrl(): string {
    return process.env.STRIPE_OAUTH_CALLBACK_URL || 'http://localhost:3000/oauth/callback';
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: this.clientName,
      client_uri: process.env.CLIENT_URI || 'http://localhost:3000',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'read write',
      token_endpoint_auth_method: 'none',
    };
  }

  clientInformation(): OAuthClientInformation | undefined {
    try {
      if (fs.existsSync(this.clientInfoFile)) {
        const content = fs.readFileSync(this.clientInfoFile, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error(`Failed to read client info: ${error}`);
    }
    return undefined;
  }

  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    try {
      fs.writeFileSync(this.clientInfoFile, JSON.stringify(info, null, 2));
    } catch (error) {
      console.error(`Failed to save client info: ${error}`);
    }
  }

  tokens(): OAuthTokens | undefined {
    try {
      if (fs.existsSync(this.tokenFile)) {
        const content = fs.readFileSync(this.tokenFile, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error(`Failed to read tokens: ${error}`);
    }
    return undefined;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    try {
      fs.writeFileSync(this.tokenFile, JSON.stringify(tokens, null, 2));
    } catch (error) {
      console.error(`Failed to save tokens: ${error}`);
    }
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    console.error('\n🔐 需要 OAuth 认证');
    console.error('请访问以下 URL 完成认证:');
    console.error(url.toString());
    console.error('\n等待认证完成...');
  }

  async codeVerifier(): Promise<string> {
    try {
      if (fs.existsSync(this.codeVerifierFile)) {
        return fs.readFileSync(this.codeVerifierFile, 'utf-8').trim();
      }
    } catch (error) {
      console.error(`Failed to read code verifier: ${error}`);
    }
    return '';
  }

  async getCodeVerifier(): Promise<string | undefined> {
    const verifier = await this.codeVerifier();
    return verifier || undefined;
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    try {
      fs.writeFileSync(this.codeVerifierFile, verifier);
    } catch (error) {
      console.error(`Failed to save code verifier: ${error}`);
    }
  }
}

export class StripeMcpClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private isConnected = false;
  private serverUrl: string;

  constructor(serverUrl: string = 'https://server.smithery.ai/stripe') {
    this.serverUrl = serverUrl;
  }

  /**
   * 连接到 Stripe MCP 服务器
   * 先尝试无认证连接，如果失败再使用 OAuth 认证
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    // 先尝试无认证连接
    try {
      console.error('尝试无认证连接 Stripe MCP 服务器...');
      this.transport = new StreamableHTTPClientTransport(new URL(this.serverUrl), {});

      this.client = new Client({
        name: 'tripnara-stripe-client',
        version: '1.0.0',
      });

      await this.client.connect(this.transport);
      this.isConnected = true;
      console.error('✅ Stripe MCP client connected (无需认证)');
      return;
    } catch (noAuthError: any) {
      // 如果无认证失败，尝试使用 OAuth
      const errorMessage = noAuthError.message || '';
      const errorCode = noAuthError.code || '';
      const needsAuth = 
        errorMessage.includes('Unauthorized') || 
        errorMessage.includes('401') || 
        errorMessage.includes('403') ||
        errorMessage.includes('invalid_token') ||
        errorMessage.includes('Missing Authorization') ||
        errorCode === 401 ||
        errorCode === 403;
      
      if (needsAuth) {
        console.error('⚠️  无认证连接失败，尝试 OAuth 认证...');
        
        // 清理之前的连接
        if (this.client) {
          try {
            await this.client.close();
          } catch (e) {
            // 忽略关闭错误
          }
        }
        this.client = null;
        this.transport = null;
        
        try {
          const authProvider = new StripeOAuthProvider(this.serverUrl);
          
          this.transport = new StreamableHTTPClientTransport(new URL(this.serverUrl), {
            authProvider,
          });

          this.client = new Client({
            name: 'tripnara-stripe-client',
            version: '1.0.0',
          });

          await this.client.connect(this.transport);
          this.isConnected = true;
          console.error('✅ Stripe MCP client connected (使用 OAuth 认证)');
        } catch (authError) {
          console.error('❌ OAuth 认证也失败:', authError);
          throw authError;
        }
      } else {
        // 其他错误，直接抛出
        console.error('❌ Failed to connect to Stripe MCP server:', noAuthError);
        throw noAuthError;
      }
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
        console.error('Error disconnecting Stripe client:', error);
      }
      this.client = null;
      this.transport = null;
      this.isConnected = false;
    }
  }

  /**
   * 确保已连接
   */
  private async ensureConnected(): Promise<Client> {
    if (!this.isConnected || !this.client) {
      await this.connect();
    }
    if (!this.client) {
      throw new Error('Stripe client not initialized');
    }
    return this.client;
  }

  /**
   * 列出所有可用的工具
   */
  async listTools(): Promise<any> {
    const client = await this.ensureConnected();
    return await client.listTools();
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: any): Promise<any> {
    const client = await this.ensureConnected();
    return await client.callTool({
      name,
      arguments: args,
    });
  }
}

// 单例实例
let stripeClientInstance: StripeMcpClient | null = null;

/**
 * 获取 Stripe MCP 客户端单例
 */
export function getStripeClient(): StripeMcpClient {
  if (!stripeClientInstance) {
    stripeClientInstance = new StripeMcpClient();
  }
  return stripeClientInstance;
}
