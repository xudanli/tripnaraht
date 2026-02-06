/**
 * Airbnb MCP Service
 * 
 * 封装 Airbnb MCP 客户端，提供业务逻辑层
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { AirbnbMcpClientConnectAPI } from './airbnb-client-connect-api';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class AirbnbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AirbnbService.name);
  private client: AirbnbMcpClientConnectAPI | null = null;
  private readonly configDir = path.join(os.homedir(), '.tripnara-mcp');
  private readonly connectionIdFile = path.join(this.configDir, 'airbnb-connection-id.txt');

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
   * 搜索房源
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
   * 获取房源照片
   * 注意: geobio/mcp-server-airbnb 不支持此功能
   * 已禁用，因为该服务器只提供 airbnb_search 和 airbnb_listing_details 工具
   */
  async getListingPhotos(listingId: string) {
    throw new Error('getListingPhotos is not supported by geobio/mcp-server-airbnb. Use airbnb_listing_details to get listing information including photos.');
  }

  /**
   * 分析房源照片
   * 注意: geobio/mcp-server-airbnb 不支持此功能
   * 已禁用，因为该服务器只提供 airbnb_search 和 airbnb_listing_details 工具
   */
  async analyzeListingPhotos(listingId: string) {
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
        return {
          isAuthorized: true,
          connectionId: savedConnectionId,
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
        const connectionId = tempClient.getConnectionId();
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
      this.logger.error('Get authorization URL failed:', error);
      throw error;
    }
  }

  /**
   * 验证授权是否完成
   */
  async verifyAuthorization(connectionId: string): Promise<{
    isAuthorized: boolean;
    message?: string;
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
      
      return {
        isAuthorized: true,
        message: '授权成功',
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
