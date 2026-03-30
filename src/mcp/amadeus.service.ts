/**
 * Amadeus MCP Service
 * 
 * 封装 Amadeus MCP 客户端，提供业务逻辑层
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { AmadeusMcpClientConnectAPI } from './amadeus-client-connect-api';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class AmadeusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AmadeusService.name);
  private client: AmadeusMcpClientConnectAPI | null = null;
  private readonly configDir = path.join(os.homedir(), '.tripnara-mcp');
  private readonly connectionIdFile = path.join(this.configDir, 'amadeus-connection-id.txt');

  async onModuleInit() {
    // 延迟初始化，避免启动时连接失败
    this.logger.log('AmadeusService initialized');
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (error) {
        this.logger.error('Failed to disconnect Amadeus client:', error);
      }
    }
  }

  /**
   * 获取或创建客户端实例
   */
  private async getClient(): Promise<AmadeusMcpClientConnectAPI> {
    // 检查客户端是否已连接（isConnected 是私有属性，通过检查 client 是否存在来判断）
    if (this.client && (this.client as any).isConnected) {
      return this.client;
    }

    // 检查是否有 Amadeus API 凭证（支持两种命名方式）
    const hasCredentials = (process.env.AMADEUS_CLIENT_ID || process.env.AMADEUS_API_KEY) && 
                          (process.env.AMADEUS_CLIENT_SECRET || process.env.AMADEUS_API_SECRET);
    
    let savedConnectionId: string | undefined;
    if (!hasCredentials && fs.existsSync(this.connectionIdFile)) {
      // 只有在没有凭证时才使用旧的 connectionId
      savedConnectionId = fs.readFileSync(this.connectionIdFile, 'utf-8').trim();
      this.logger.debug(`Loaded saved connectionId: ${savedConnectionId}`);
    } else if (hasCredentials && fs.existsSync(this.connectionIdFile)) {
      // 如果有凭证但存在旧连接，删除旧连接文件以强制重新创建（传递配置）
      this.logger.debug('Amadeus credentials found, will create new connection with config');
      // 删除旧连接文件，强制重新创建以传递配置
      try {
        fs.unlinkSync(this.connectionIdFile);
        this.logger.debug('Deleted old connectionId file to recreate with config');
      } catch (error) {
        // 忽略删除错误
      }
    }

    this.client = new AmadeusMcpClientConnectAPI(undefined, savedConnectionId);

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
      this.logger.error('Failed to connect to Amadeus MCP:', error.message);
      
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
   * 搜索航班
   */
  async searchFlightOffers(params: {
    originLocationCode: string;
    destinationLocationCode: string;
    departureDate: string;
    adults: number;
    returnDate?: string;
    children?: number;
    infants?: number;
    travelClass?: string;
    includedAirlineCodes?: string;
    excludedAirlineCodes?: string;
    nonStop?: boolean;
    currencyCode?: string;
    maxPrice?: number;
    max?: number;
  }) {
    const client = await this.getClient();
    
    return await client.callTool('search_flight_offers', {
      originLocationCode: params.originLocationCode,
      destinationLocationCode: params.destinationLocationCode,
      departureDate: params.departureDate,
      adults: params.adults,
      returnDate: params.returnDate,
      children: params.children,
      infants: params.infants,
      travelClass: params.travelClass,
      includedAirlineCodes: params.includedAirlineCodes,
      excludedAirlineCodes: params.excludedAirlineCodes,
      nonStop: params.nonStop,
      currencyCode: params.currencyCode,
      maxPrice: params.maxPrice,
      max: params.max,
    });
  }

  /**
   * Ping 测试
   */
  async ping() {
    const client = await this.getClient();
    return await client.callTool('ping', {});
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
      const testClient = new AmadeusMcpClientConnectAPI(undefined, savedConnectionId);
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
      const tempClient = new AmadeusMcpClientConnectAPI();
      
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
      const testClient = new AmadeusMcpClientConnectAPI(undefined, connectionId);
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
