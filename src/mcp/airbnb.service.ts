/**
 * Airbnb MCP Service
 * 
 * 封装 Airbnb MCP 客户端，提供业务逻辑层
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { AirbnbMcpClientConnectAPI } from './airbnb-client-connect-api';
import { AirbnbDirectService } from './airbnb-direct.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class AirbnbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AirbnbService.name);
  private client: AirbnbMcpClientConnectAPI | null = null;
  private readonly configDir = path.join(os.homedir(), '.tripnara-mcp');
  private readonly connectionIdFile = path.join(this.configDir, 'airbnb-connection-id.txt');

  constructor(private readonly airbnbDirect: AirbnbDirectService) {}

  async onModuleInit() {
    // 延迟初始化，避免启动时连接失败
    this.logger.log('AirbnbService initialized');
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (error) {
        this.logger.error('Failed to disconnect Airbnb client:', error);
      }
    }
  }

  /**
   * 获取或创建客户端实例
   */
  private async getClient(): Promise<AirbnbMcpClientConnectAPI> {
    // 检查客户端是否已连接（isConnected 是私有属性，通过检查 client 是否存在来判断）
    if (this.client && (this.client as any).isConnected) {
      return this.client;
    }

    // 尝试加载保存的 connectionId
    let savedConnectionId: string | undefined;
    if (fs.existsSync(this.connectionIdFile)) {
      savedConnectionId = fs.readFileSync(this.connectionIdFile, 'utf-8').trim();
      this.logger.debug(`Loaded saved connectionId: ${savedConnectionId}`);
    }

    this.client = new AirbnbMcpClientConnectAPI(undefined, savedConnectionId);

    try {
      await this.client.connect();
      
      // 保存 connectionId
      const connectionId = this.client.getConnectionId();
      if (connectionId) {
        if (!fs.existsSync(this.configDir)) {
          fs.mkdirSync(this.configDir, { recursive: true });
        }
        fs.writeFileSync(this.connectionIdFile, connectionId);
        this.logger.debug(`Saved connectionId: ${connectionId}`);
      }
    } catch (error: any) {
      this.logger.error('Failed to connect to Airbnb MCP:', error.message);
      
      // 如果是 OAuth 错误，保存 connectionId
      if (error.message?.includes('OAuth authorization required')) {
        const connectionId = this.client.getConnectionId();
        if (connectionId) {
          if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
          }
          fs.writeFileSync(this.connectionIdFile, connectionId);
        }
      }
      
      throw error;
    }

    return this.client;
  }

  /**
   * 搜索房源。
   * 优先本机 Direct；失败不再等 Smithery 刮页 MCP（同病且易拖垮 LIVE_TOOL_HOTEL 超时）。
   */
  async searchListings(params: {
    location: string;
    adults?: number;
    children?: number;
    infants?: number;
    pets?: number;
    checkin?: string;
    checkout?: string;
    page?: number;
    ignoreRobotsText?: boolean;
  }) {
    const allowMcpFallback =
      process.env.AIRBNB_MCP_SEARCH_FALLBACK === 'true' ||
      process.env.AIRBNB_MCP_SEARCH_FALLBACK === '1';

    try {
      const direct = await this.airbnbDirect.searchListings(params);
      const text = direct?.content?.[0]?.type === 'text' ? direct.content[0].text : '';
      let parsed: { searchResults?: unknown[]; error?: string } = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = {};
      }
      if (Array.isArray(parsed.searchResults) && parsed.searchResults.length > 0) {
        this.logger.debug(`Airbnb Direct 成功 ${parsed.searchResults.length} 条`);
        return direct;
      }
      this.logger.warn(
        `Airbnb Direct 无结果: ${parsed.error || 'empty'}${allowMcpFallback ? '，降级 MCP' : ''}`,
      );
      if (!allowMcpFallback) {
        return direct;
      }
    } catch (e: any) {
      this.logger.warn(`Airbnb Direct 异常: ${e?.message ?? e}`);
      if (!allowMcpFallback) {
        throw e;
      }
    }

    const client = await this.getClient();
    return await client.callTool('airbnb_search', {
      location: params.location,
      adults: params.adults ?? 1,
      children: params.children ?? 0,
      infants: params.infants ?? 0,
      pets: params.pets ?? 0,
      checkin: params.checkin,
      checkout: params.checkout,
      page: params.page ?? 1,
      ignoreRobotsText: params.ignoreRobotsText ?? false,
    });
  }

  /**
   * 获取房源详情
   */
  async getListingDetails(params: {
    listingId: string;
    checkin?: string;
    checkout?: string;
    adults?: number;
    children?: number;
    infants?: number;
    pets?: number;
    ignoreRobotsText?: boolean;
  }) {
    const client = await this.getClient();
    
    return await client.callTool('airbnb_listing_details', {
      listingId: params.listingId,
      checkin: params.checkin,
      checkout: params.checkout,
      adults: params.adults,
      children: params.children,
      infants: params.infants,
      pets: params.pets,
      ignoreRobotsText: params.ignoreRobotsText ?? false,
    });
  }

  /**
   * Direct 房源页粗探所选日期是否可订（不走 Smithery MCP）。
   */
  async probeListingStayAvailability(params: {
    listingId: string;
    checkin?: string;
    checkout?: string;
    adults?: number;
    timeoutMs?: number;
  }): Promise<{ available: boolean | 'unknown'; reason?: string }> {
    return this.airbnbDirect.probeListingStayAvailability(params);
  }

  /**
   * 获取房源照片
   * 注意: geobio/mcp-server-airbnb 不支持此功能
   * 已禁用，因为该服务器只提供 airbnb_search 和 airbnb_listing_details 工具
   */
  async getListingPhotos(_listingId: string) {
    throw new Error('getListingPhotos is not supported by geobio/mcp-server-airbnb. Use airbnb_listing_details to get listing information including photos.');
  }

  /**
   * 分析房源照片
   * 注意: geobio/mcp-server-airbnb 不支持此功能
   * 已禁用，因为该服务器只提供 airbnb_search 和 airbnb_listing_details 工具
   */
  async analyzeListingPhotos(_listingId: string) {
    throw new Error('analyzeListingPhotos is not supported by geobio/mcp-server-airbnb. Use airbnb_listing_details to get listing information.');
  }

  /**
   * 列出所有可用工具
   */
  async listTools() {
    const client = await this.getClient();
    return await client.listTools();
  }

  /**
   * 检查授权状态
   */
  async checkAuthStatus(): Promise<{
    isAuthorized: boolean;
    authorizationUrl?: string;
    connectionId?: string;
    userInfo?: { displayName: string; connectionId: string; email?: string };
  }> {
    try {
      // 尝试加载保存的 connectionId
      let savedConnectionId: string | undefined;
      if (fs.existsSync(this.connectionIdFile)) {
        savedConnectionId = fs.readFileSync(this.connectionIdFile, 'utf-8').trim();
      }

      if (!savedConnectionId) {
        // 没有 connectionId，需要首次授权
        return {
          isAuthorized: false,
        };
      }

      // 尝试使用保存的 connectionId 连接
      const testClient = new AirbnbMcpClientConnectAPI(undefined, savedConnectionId);
      try {
        await testClient.connect();
        // 连接成功，已授权
        const userInfo = await this.getConnectionUserInfo(savedConnectionId);
        return {
          isAuthorized: true,
          connectionId: savedConnectionId,
          userInfo,
        };
      } catch (error: any) {
        // 连接失败，可能需要重新授权
        if (error.message?.includes('OAuth authorization required')) {
          const authUrl = error.message.split('Visit: ')[1] || '';
          return {
            isAuthorized: false,
            authorizationUrl: authUrl,
            connectionId: savedConnectionId,
          };
        }
        // 其他错误，假设已授权但连接有问题
        return {
          isAuthorized: false,
          connectionId: savedConnectionId,
        };
      }
    } catch (error: any) {
      this.logger.error('Check auth status failed:', error);
      return {
        isAuthorized: false,
      };
    }
  }

  /**
   * 获取授权 URL
   */
  async getAuthorizationUrl(): Promise<{
    authorizationUrl: string;
    connectionId: string;
  }> {
    try {
      // 创建新连接以获取授权 URL
      const tempClient = new AirbnbMcpClientConnectAPI();
      
      try {
        await tempClient.connect();
        // 如果连接成功，说明已经授权
        throw new Error('Already authorized');
      } catch (error: any) {
        if (error.message?.includes('OAuth authorization required')) {
          const authUrl = error.message.split('Visit: ')[1] || '';
          const connectionId = tempClient.getConnectionId();
          
          if (!connectionId) {
            throw new Error('Failed to get connectionId');
          }

          // 保存 connectionId
          if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
          }
          fs.writeFileSync(this.connectionIdFile, connectionId);

          return {
            authorizationUrl: authUrl,
            connectionId: connectionId,
          };
        }
        throw error;
      }
    } catch (error: any) {
      if (error.message?.includes('Already authorized')) {
        this.logger.debug('Already authorized, no auth URL needed');
      } else {
        this.logger.error('Get authorization URL failed:', error);
      }
      throw error;
    }
  }

  /**
   * 撤销授权（删除本地保存的 connectionId）
   */
  async revokeAuthorization(): Promise<void> {
    if (fs.existsSync(this.connectionIdFile)) {
      fs.unlinkSync(this.connectionIdFile);
      this.logger.log('Airbnb authorization revoked');
    }
    // 断开当前客户端连接
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (e) {
        this.logger.warn('Failed to disconnect client during revoke:', e);
      }
      this.client = null;
    }
  }

  /**
   * 获取连接用户信息（用于已连接时展示）
   * geobio/mcp-server-airbnb 不暴露用户资料接口，返回 connectionId 作为标识
   */
  async getConnectionUserInfo(connectionId: string): Promise<{
    displayName: string;
    connectionId: string;
    email?: string;
  }> {
    // 尝试从 Smithery API 获取连接详情（可能有 metadata）
    try {
      const { Smithery } = await import('@smithery/api');
      const apiKey = process.env.SMITHERY_API_KEY;
      if (apiKey) {
        const smithery = new Smithery({ apiKey });
        const { namespaces } = await smithery.namespaces.list();
        for (const ns of namespaces) {
          try {
            const conn = await smithery.experimental.connect.connections.get(connectionId, {
              namespace: ns.name,
            });
            const meta = conn.metadata as Record<string, unknown> | null;
            const displayName =
              (meta?.displayName as string) ??
              (meta?.name as string) ??
              (conn.name || 'Airbnb 账号');
            const email = meta?.email as string | undefined;
            return {
              displayName: displayName !== connectionId ? displayName : 'Airbnb 账号',
              connectionId,
              ...(email && { email }),
            };
          } catch {
            continue;
          }
        }
      }
    } catch (e) {
      this.logger.debug('Could not fetch Smithery connection details:', (e as Error).message);
    }
    return {
      displayName: 'Airbnb 账号',
      connectionId,
    };
  }

  /**
   * 验证授权是否完成
   */
  async verifyAuthorization(connectionId: string): Promise<{
    isAuthorized: boolean;
    message?: string;
    userInfo?: { displayName: string; connectionId: string; email?: string };
  }> {
    try {
      const testClient = new AirbnbMcpClientConnectAPI(undefined, connectionId);
      await testClient.connect();
      
      // 连接成功，授权完成
      // 保存 connectionId
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      fs.writeFileSync(this.connectionIdFile, connectionId);
      const userInfo = await this.getConnectionUserInfo(connectionId);
      return {
        isAuthorized: true,
        message: '授权成功',
        userInfo,
      };
    } catch (error: any) {
      if (error.message?.includes('OAuth authorization required')) {
        return {
          isAuthorized: false,
          message: '授权尚未完成，请完成 OAuth 流程',
        };
      }
      return {
        isAuthorized: false,
        message: error.message || '验证失败',
      };
    }
  }
}
