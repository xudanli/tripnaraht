/**
 * File Extractor MCP Client
 * 
 * 客户端连接到 File Extractor MCP 服务
 * 提供文件内容提取和元数据提取功能
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
export class FileExtractorOAuthProvider implements OAuthClientProvider {
  private tokenFile: string;
  private clientInfoFile: string;
  private codeVerifierFile: string;
  private configDir: string;

  constructor(private serverUrl: string, private clientName: string = 'TripNara File Extractor Client') {
    // 创建配置目录（支持 TRIPNARA_MCP_CONFIG_DIR 持久化到卷/项目目录，Docker 可挂载）
    const baseDir =
      process.env.TRIPNARA_MCP_CONFIG_DIR || path.join(os.homedir(), '.tripnara-mcp');
    this.configDir = path.resolve(baseDir);
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // 使用服务器名称作为文件名的一部分
    const serverName = serverUrl.split('/').pop() || 'file-extractor-mcp';
    this.tokenFile = path.join(this.configDir, `${serverName}-tokens.json`);
    this.clientInfoFile = path.join(this.configDir, `${serverName}-client-info.json`);
    this.codeVerifierFile = path.join(this.configDir, `${serverName}-code-verifier.txt`);
  }

  get redirectUrl(): string {
    return process.env.FILE_EXTRACTOR_OAUTH_CALLBACK_URL || 'http://localhost:3000/oauth/callback';
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

export class FileExtractorMcpClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private isConnected = false;
  private serverUrl: string;

  constructor(serverUrl: string = 'https://server.smithery.ai/@dravidsajinraj-iex/file-extractor-mcp') {
    this.serverUrl = serverUrl;
  }

  /**
   * 连接到 File Extractor MCP 服务器
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      const authProvider = new FileExtractorOAuthProvider(this.serverUrl);
      
      this.transport = new StreamableHTTPClientTransport(new URL(this.serverUrl), {
        authProvider,
      });

      this.client = new Client({
        name: 'tripnara-file-extractor-client',
        version: '1.0.0',
      });

      await this.client.connect(this.transport);
      this.isConnected = true;
      console.error('✅ File Extractor MCP client connected');
    } catch (error) {
      console.error('❌ Failed to connect to File Extractor MCP server:', error);
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
        console.error('Error disconnecting File Extractor client:', error);
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
      throw new Error('File Extractor client not initialized');
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

  /**
   * 提取文件元数据
   */
  async extractMetadata(url: string): Promise<any> {
    return await this.callTool('extract_metadata', { url });
  }

  /**
   * 提取文件内容
   */
  async extractFileContent(
    url: string,
    options?: {
      page?: number;
      limit?: number;
      search?: string;
      sheet?: string;
      caseSensitive?: boolean;
    }
  ): Promise<any> {
    return await this.callTool('extract_file_content', {
      url,
      ...options,
    });
  }
}

// 单例实例
let fileExtractorClientInstance: FileExtractorMcpClient | null = null;

/**
 * 获取 File Extractor MCP 客户端单例
 */
export function getFileExtractorClient(): FileExtractorMcpClient {
  if (!fileExtractorClientInstance) {
    fileExtractorClientInstance = new FileExtractorMcpClient();
  }
  return fileExtractorClientInstance;
}
