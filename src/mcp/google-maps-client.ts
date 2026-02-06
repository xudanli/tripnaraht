/**
 * Google Maps MCP Client
 * 
 * 客户端连接到 Smithery 的 Google Maps MCP 服务
 * 提供地图、地理编码、路线规划等功能
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformation, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 文件系统 OAuth Provider
class FileOAuthProvider implements OAuthClientProvider {
  private tokenFile: string;
  private clientInfoFile: string;
  private codeVerifierFile: string;
  private configDir: string;

  constructor(private serverUrl: string) {
    // 创建配置目录
    const homeDir = os.homedir();
    this.configDir = path.join(homeDir, '.tripnara-mcp');
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // 使用服务器名称作为文件名的一部分
    const serverName = serverUrl.split('/').pop() || 'google_maps';
    this.tokenFile = path.join(this.configDir, `${serverName}-tokens.json`);
    this.clientInfoFile = path.join(this.configDir, `${serverName}-client-info.json`);
    this.codeVerifierFile = path.join(this.configDir, `${serverName}-code-verifier.txt`);
  }

  get redirectUrl(): string {
    return 'http://localhost:3000/oauth/callback';
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'TripNara Google Maps Bridge',
      client_uri: 'http://localhost:3000',
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
      console.error('✅ Client information saved');
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
      console.error('✅ OAuth tokens saved');
    } catch (error) {
      console.error(`Failed to save tokens: ${error}`);
    }
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    console.error('\n🔐 请访问以下 URL 完成 Google Maps 认证:');
    console.error(url.toString());
    console.error('\n认证完成后，服务器将自动连接。\n');
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
 * Google Maps MCP 客户端
 */
export class GoogleMapsMcpClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  private authProvider: FileOAuthProvider;
  private isConnected: boolean = false;

  constructor(serverUrl: string = 'https://server.smithery.ai/google_maps') {
    // 创建 OAuth Provider
    this.authProvider = new FileOAuthProvider(serverUrl);

    // 创建 HTTP 传输层
    this.transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      authProvider: this.authProvider,
    });

    // 创建 MCP 客户端
    this.client = new Client({
      name: 'tripnara-google-maps-client',
      version: '1.0.0',
    });
  }

  /**
   * 连接到 Google Maps MCP 服务器
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      // 检查 transport 是否已经启动
      if ((this.transport as any).started) {
        this.isConnected = true;
        console.log('✅ Transport already started, reusing connection');
        return;
      }

      await this.client.connect(this.transport);
      this.isConnected = true;
      console.log('✅ Connected to Google Maps MCP server');
    } catch (error: any) {
      // 如果错误是因为 transport 已经启动，标记为已连接
      if (error.message?.includes('already started')) {
        this.isConnected = true;
        console.log('✅ Transport already started, connection reused');
        return;
      }
      
      // 处理会话过期或未找到的错误
      if (error.message?.includes('Session not found') || 
          error.message?.includes('expired') ||
          error.message?.includes('Unauthorized')) {
        console.error('\n⚠️  认证会话已过期或未找到');
        console.error('请运行以下命令重新认证:');
        console.error('  npm run mcp:auth:google-maps\n');
        throw new Error('Session expired. Please re-authenticate using: npm run mcp:auth:google-maps');
      }
      
      console.error('❌ Failed to connect:', error);
      throw error;
    }
  }

  /**
   * 清理认证信息（用于重新认证）
   */
  clearAuth(): void {
    try {
      const homeDir = os.homedir();
      const configDir = path.join(homeDir, '.tripnara-mcp');
      const serverName = 'google_maps';
      
      const tokenFile = path.join(configDir, `${serverName}-tokens.json`);
      const clientInfoFile = path.join(configDir, `${serverName}-client-info.json`);
      const codeVerifierFile = path.join(configDir, `${serverName}-code-verifier.txt`);
      
      if (fs.existsSync(tokenFile)) {
        fs.unlinkSync(tokenFile);
        console.log('✅ 已删除认证 tokens');
      }
      if (fs.existsSync(clientInfoFile)) {
        fs.unlinkSync(clientInfoFile);
        console.log('✅ 已删除客户端信息');
      }
      if (fs.existsSync(codeVerifierFile)) {
        fs.unlinkSync(codeVerifierFile);
        console.log('✅ 已删除代码验证器');
      }
      
      this.isConnected = false;
    } catch (error) {
      console.error('清理认证信息时出错:', error);
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
      console.log('✅ Disconnected from Google Maps MCP server');
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  }

  /**
   * 确保已连接
   */
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  /**
   * 列出所有可用的工具
   */
  async listTools(): Promise<any> {
    await this.ensureConnected();
    return await this.client.listTools();
  }

  /**
   * 计算路线矩阵（现代 API，支持 OAuth2）
   */
  async computeRouteMatrix(params: {
    origins: string[];
    destinations: string[];
    travelMode?: string;
    units?: string;
    languageCode?: string;
    routingPreference?: string;
    fieldMask?: string;
  }): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name: 'GOOGLE_MAPS_COMPUTE_ROUTE_MATRIX',
      arguments: params,
    });
    return result;
  }

  /**
   * 获取路线（现代 API，支持 OAuth2）
   */
  async getRoute(params: {
    origin_address: string;
    destination_address: string;
    travelMode?: string;
    units?: string;
    languageCode?: string;
    routingPreference?: string;
    computeAlternativeRoutes?: boolean;
    routeModifiers_avoidTolls?: boolean;
    routeModifiers_avoidFerries?: boolean;
    routeModifiers_avoidHighways?: boolean;
    fieldMask?: string;
  }): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name: 'GOOGLE_MAPS_GET_ROUTE',
      arguments: params,
    });
    return result;
  }

  /**
   * 地理编码（已废弃，仅支持 API Key）
   */
  async geocode(params: {
    address?: string;
    latlng?: string;
    place_id?: string;
    language?: string;
    region?: string;
    bounds?: string;
    components?: string;
    result_type?: string;
    location_type?: string;
    key?: string;
  }): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name: 'GOOGLE_MAPS_GEOCODING_API',
      arguments: params,
    });
    return result;
  }

  /**
   * 获取方向（已废弃，仅支持 API Key）
   */
  async getDirection(params: {
    origin: string;
    destination: string;
    mode?: string;
    waypoints?: string;
    avoid?: string;
    units?: string;
    language?: string;
    key?: string;
  }): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name: 'GOOGLE_MAPS_GET_DIRECTION',
      arguments: params,
    });
    return result;
  }

  /**
   * 距离矩阵（已废弃，仅支持 API Key）
   */
  async distanceMatrix(params: {
    origins: string;
    destinations: string;
    mode?: string;
    units?: string;
    language?: string;
    avoid?: string;
    departure_time?: number;
    arrival_time?: number;
    transit_mode?: string;
    transit_routing_preference?: string;
    traffic_model?: string;
    region?: string;
    key?: string;
  }): Promise<any> {
    await this.ensureConnected();
    const result = await this.client.callTool({
      name: 'GOOGLE_MAPS_DISTANCE_MATRIX_API',
      arguments: params,
    });
    return result;
  }
}

// 单例实例
let googleMapsClientInstance: GoogleMapsMcpClient | null = null;

/**
 * 获取 Google Maps MCP 客户端单例
 */
export function getGoogleMapsClient(): GoogleMapsMcpClient {
  if (!googleMapsClientInstance) {
    googleMapsClientInstance = new GoogleMapsMcpClient();
  }
  return googleMapsClientInstance;
}
