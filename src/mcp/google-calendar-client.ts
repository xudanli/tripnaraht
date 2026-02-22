/**
 * Google Calendar MCP Client
 * 
 * 用于在代码中直接使用 Google Calendar MCP 服务的客户端类
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
  private onRedirectCallback?: (url: string) => void;

  constructor(
    private serverUrl: string,
    private clientName: string = 'TripNara Google Calendar Client',
    onRedirectToAuthorization?: (url: string) => void,
  ) {
    this.onRedirectCallback = onRedirectToAuthorization;
    // 创建配置目录
    const homeDir = os.homedir();
    this.configDir = path.join(homeDir, '.tripnara-mcp');
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // 使用服务器名称作为文件名的一部分
    const serverName = serverUrl.split('/').pop() || 'googlecalendar';
    this.tokenFile = path.join(this.configDir, `${serverName}-tokens.json`);
    this.clientInfoFile = path.join(this.configDir, `${serverName}-client-info.json`);
    this.codeVerifierFile = path.join(this.configDir, `${serverName}-code-verifier.txt`);
  }

  get redirectUrl(): string {
    return process.env.GOOGLE_CALENDAR_OAUTH_CALLBACK_URL || 'http://localhost:3000/oauth/callback';
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
    const urlStr = url.toString();
    this.onRedirectCallback?.(urlStr);
    console.log('\n🔐 ============================================');
    console.log('Google Calendar 认证');
    console.log('============================================');
    console.log('\n请访问以下 URL 完成 Google Calendar 认证:');
    console.log(`\n${urlStr}\n`);
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
 * Google Calendar MCP 客户端
 */
export class GoogleCalendarMcpClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  private authProvider: FileOAuthProvider;
  private isConnected: boolean = false;

  constructor(
    serverUrl: string = 'https://server.smithery.ai/googlecalendar',
    authProvider?: FileOAuthProvider,
  ) {
    this.authProvider = authProvider ?? new FileOAuthProvider(serverUrl, 'TripNara Google Calendar Client');

    // 创建 HTTP 传输层
    this.transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      authProvider: this.authProvider,
    });

    // 创建 MCP 客户端
    this.client = new Client({
      name: 'tripnara-google-calendar-client',
      version: '1.0.0',
    });
  }

  /**
   * 获取授权 URL（用于 API 返回）
   */
  static async getAuthorizationUrl(): Promise<string> {
    let capturedUrl: string | undefined;
    const provider = new FileOAuthProvider(
      'https://server.smithery.ai/googlecalendar',
      'TripNara Google Calendar Client',
      (url) => { capturedUrl = url; },
    );
    const tempClient = new GoogleCalendarMcpClient('https://server.smithery.ai/googlecalendar', provider);
    try {
      await tempClient.connect();
      throw new Error('Already authorized');
    } catch (error: any) {
      if (capturedUrl) return capturedUrl;
      if (error.message?.includes('Already authorized')) throw error;
      throw error;
    }
  }

  /**
   * 连接到 Google Calendar MCP 服务器
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      // 检查 transport 是否已经启动
      // 如果 transport 已经启动，直接标记为已连接
      if ((this.transport as any).started) {
        this.isConnected = true;
        console.log('✅ Transport already started, reusing connection');
        return;
      }

      await this.client.connect(this.transport);
      this.isConnected = true;
      console.log('✅ Connected to Google Calendar MCP server');
    } catch (error: any) {
      // 如果错误是因为 transport 已经启动，标记为已连接
      if (error.message?.includes('already started')) {
        this.isConnected = true;
        console.log('✅ Transport already started, connection reused');
        return;
      }
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
      console.log('✅ Disconnected from Google Calendar MCP server');
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
   * 列出日历事件
   */
  async listEvents(params: {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  } = {}): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name: 'events_list',
      arguments: params,
    });
    return result;
  }

  /**
   * 创建日历事件
   */
  async createEvent(params: {
    calendarId?: string;
    summary: string;
    start: { dateTime: string; timeZone?: string } | { date: string };
    end: { dateTime: string; timeZone?: string } | { date: string };
    description?: string;
    location?: string;
    attendees?: Array<{ email: string }>;
  }): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name: 'create_event',
      arguments: params,
    });
    return result;
  }

  /**
   * 删除日历事件
   */
  async deleteEvent(params: {
    calendarId: string;
    eventId: string;
  }): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name: 'delete_event',
      arguments: params,
    });
    return result;
  }

  /**
   * 更新日历事件
   */
  async updateEvent(params: {
    calendarId: string;
    eventId: string;
    summary?: string;
    start?: { dateTime: string; timeZone?: string } | { date: string };
    end?: { dateTime: string; timeZone?: string } | { date: string };
    description?: string;
    location?: string;
  }): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name: 'update_event',
      arguments: params,
    });
    return result;
  }

  /**
   * 查找日历事件
   */
  async findEvent(params: {
    calendarId?: string;
    query?: string;
    timeMin?: string;
    timeMax?: string;
  }): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name: 'find_event',
      arguments: params,
    });
    return result;
  }

  /**
   * 获取当前日期时间
   */
  async getCurrentDateTime(): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name: 'get_current_date_time',
      arguments: {},
    });
    return result;
  }

  /**
   * 查找空闲时间段
   */
  async findFreeSlots(params: {
    calendarId?: string;
    timeMin: string;
    timeMax: string;
    durationMinutes?: number;
  }): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name: 'find_free_slots',
      arguments: params,
    });
    return result;
  }

  /**
   * 列出所有日历
   */
  async listCalendars(): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name: 'list_calendars',
      arguments: {},
    });
    return result;
  }

  /**
   * 快速添加事件（自然语言）
   */
  async quickAdd(params: {
    calendarId?: string;
    text: string;
  }): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name: 'quick_add',
      arguments: params,
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
