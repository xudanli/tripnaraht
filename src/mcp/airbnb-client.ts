/**
 * Airbnb MCP Client
 * 
 * 用于在代码中直接使用 Airbnb MCP 服务的客户端类
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
export class FileOAuthProvider implements OAuthClientProvider {
  private tokenFile: string;
  private clientInfoFile: string;
  private codeVerifierFile: string;
  private configDir: string;

  constructor(private serverUrl: string, private clientName: string = 'TripNara Airbnb Client') {
    // 创建配置目录
    const homeDir = os.homedir();
    this.configDir = path.join(homeDir, '.tripnara-mcp');
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // 使用服务器名称作为文件名的一部分
    const serverName = serverUrl.split('/').pop() || 'airbnb';
    this.tokenFile = path.join(this.configDir, `${serverName}-tokens.json`);
    this.clientInfoFile = path.join(this.configDir, `${serverName}-client-info.json`);
    this.codeVerifierFile = path.join(this.configDir, `${serverName}-code-verifier.txt`);
  }

  get redirectUrl(): string {
    return process.env.AIRBNB_OAUTH_CALLBACK_URL || 'http://localhost:3000/oauth/callback';
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
    console.log('\n🔐 ============================================');
    console.log('Airbnb 认证');
    console.log('============================================');
    console.log('\n请访问以下 URL 完成 Airbnb 认证:');
    console.log(`\n${url.toString()}\n`);
    console.log('认证完成后，请在回调 URL 中获取授权码。');
    console.log('============================================\n');
    
    // 尝试自动打开浏览器
    try {
      // 动态导入 open 模块（可选依赖）
      // @ts-ignore - open 是可选依赖，可能未安装
      const openModule = await import('open').catch(() => null);
      if (openModule?.default) {
        await openModule.default(url.toString());
      }
      console.log('✅ 已在浏览器中打开认证页面\n');
    } catch (error) {
      // 如果 open 包不可用，忽略错误
    }
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    try {
      fs.writeFileSync(this.codeVerifierFile, verifier);
    } catch (error) {
      console.error(`Failed to save code verifier: ${error}`);
    }
  }

  async codeVerifier(): Promise<string> {
    try {
      if (fs.existsSync(this.codeVerifierFile)) {
        return fs.readFileSync(this.codeVerifierFile, 'utf-8');
      }
    } catch (error) {
      console.error(`Failed to read code verifier: ${error}`);
    }
    throw new Error('No code verifier stored');
  }
}

/**
 * Airbnb MCP 客户端
 */
export class AirbnbMcpClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  private authProvider: FileOAuthProvider;
  private isConnected: boolean = false;

  constructor(serverUrl: string = 'https://server.smithery.ai/geobio/mcp-server-airbnb') {
    // 创建 OAuth Provider
    this.authProvider = new FileOAuthProvider(serverUrl, 'TripNara Airbnb Client');

    // 创建 HTTP 传输层
    this.transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      authProvider: this.authProvider,
    });

    // 创建 MCP 客户端
    this.client = new Client({
      name: 'tripnara-airbnb-client',
      version: '1.0.0',
    });
  }

  /**
   * 连接到 Airbnb MCP 服务器
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      await this.client.connect(this.transport);
      this.isConnected = true;
      console.log('✅ Connected to Airbnb MCP server');
    } catch (error) {
      console.error('❌ Failed to connect:', error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
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
    return await this.client.listTools();
  }

  /**
   * 调用工具（通用方法）
   */
  async callTool(name: string, arguments_: Record<string, any> = {}): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name,
      arguments: arguments_,
    });
    return result;
  }

  /**
   * 确保已连接
   */
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }
  }
}
