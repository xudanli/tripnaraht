/**
 * Google Maps Direct Service
 * 
 * 直接使用 Google Maps API，不依赖 Smithery MCP 服务
 * 使用 API Key 认证
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

@Injectable()
export class GoogleMapsDirectService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GoogleMapsDirectService.name);
  private axiosInstance: AxiosInstance;
  private apiKey: string | null = null;
  private isAvailable: boolean = false;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api';

  constructor(@Optional() private configService?: ConfigService) {
    this.apiKey = this.configService?.get<string>('GOOGLE_MAPS_API_KEY') || 
                  process.env.GOOGLE_MAPS_API_KEY || 
                  null;
    
    // 初始化 axios 实例（延迟到 onModuleInit）
    this.axiosInstance = null as any;
  }

  async onModuleInit() {
    if (this.apiKey) {
      // 初始化 HTTP 客户端（支持代理）
      const proxyUrl =
        process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.ALL_PROXY ||
        process.env.all_proxy;
      
      const httpsAgent = proxyUrl
        ? new HttpsProxyAgent<string>(proxyUrl)
        : new https.Agent({
            keepAlive: true,
            family: 4, // 强制 IPv4
            rejectUnauthorized: true,
          });

      this.axiosInstance = axios.create({
        baseURL: this.baseUrl,
        timeout: 10000, // 减少超时时间到10秒，避免长时间等待
        httpsAgent,
        proxy: false,
        headers: {
          'User-Agent': 'TripNARA/1.0',
        },
      });

      this.isAvailable = true;
      this.logger.log('Google Maps Direct Service initialized with API Key');
    } else {
      this.logger.warn('Google Maps API Key not found. Service will not be available.');
      this.isAvailable = false;
    }
  }

  async onModuleDestroy() {
    // Client 不需要显式关闭
    this.logger.log('Google Maps Direct Service destroyed');
  }

  /**
   * 获取交通状态（Traffic API）
   * 
   * 用于Phase 2: 实时世界状态更新
   * 获取非冰岛国家的道路状态
   */
  async getTrafficStatus(params: {
    roadId: string;
    location: { lat: number; lng: number };
    radius?: number; // 搜索半径（米），默认5000
  }): Promise<{
    status: 'OPEN' | 'CLOSED' | 'CONDITIONAL' | 'SLOW' | 'MODERATE';
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    description?: string;
    confidence: number;
  } | null> {
    if (!this.isServiceAvailable()) {
      this.logger.warn('Google Maps API Key not configured, cannot get traffic status');
      return null;
    }

    try {
      // 使用Google Maps Roads API获取道路信息
      // 注意：Google Maps没有直接的Traffic Status API，我们使用Roads API + Directions API组合
      // 方法1: 使用Directions API获取路线状态
      try {
        const directionsResponse = await this.axiosInstance.get('/directions/json', {
          params: {
            origin: `${params.location.lat},${params.location.lng}`,
            destination: `${params.location.lat + 0.01},${params.location.lng + 0.01}`, // 附近点
            key: this.apiKey!,
            alternatives: false,
            traffic_model: 'best_guess',
            departure_time: 'now',
          },
        });

        if (directionsResponse.data?.routes?.[0]) {
          const route = directionsResponse.data.routes[0];
          const leg = route.legs?.[0];
          
          // 检查是否有交通信息
          if (leg?.duration_in_traffic && leg?.duration) {
            const trafficDelay = leg.duration_in_traffic.value - leg.duration.value;
            const delayMinutes = Math.floor(trafficDelay / 60);
            
            // 根据延迟判断状态
            let status: 'OPEN' | 'CLOSED' | 'CONDITIONAL' | 'SLOW' | 'MODERATE' = 'OPEN';
            let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
            
            if (delayMinutes > 30) {
              status = 'SLOW';
              severity = 'HIGH';
            } else if (delayMinutes > 15) {
              status = 'MODERATE';
              severity = 'MEDIUM';
            } else if (delayMinutes > 5) {
              status = 'SLOW';
              severity = 'LOW';
            }

            return {
              status,
              severity,
              description: delayMinutes > 0 
                ? `预计延迟 ${delayMinutes} 分钟`
                : '交通畅通',
              confidence: 0.8,
            };
          }
        }
      } catch (directionsError: any) {
        this.logger.warn(
          `[GoogleMapsDirect] Directions API调用失败: ${directionsError.message}`,
        );
      }

      // 方法2: 使用Roads API获取道路信息（如果有）
      // 注意：Roads API主要用于snap to roads，不直接提供交通状态
      // 这里返回默认状态
      return {
        status: 'OPEN',
        severity: 'LOW',
        description: '无法获取实时交通状态，假设道路开放',
        confidence: 0.5,
      };
    } catch (error: any) {
      this.logger.error(
        `[GoogleMapsDirect] 获取交通状态失败: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * 检查服务是否可用
   */
  isServiceAvailable(): boolean {
    return this.isAvailable && !!this.apiKey;
  }

  /**
   * 获取路线
   */
  async getRoute(params: {
    origin: string;
    destination: string;
    mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
    waypoints?: string[];
    avoid?: ('tolls' | 'highways' | 'ferries')[];
    alternatives?: boolean;
    language?: string;
    units?: 'metric' | 'imperial';
  }): Promise<any> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Maps API Key not configured');
    }

    try {
      const requestParams: any = {
        origin: params.origin,
        destination: params.destination,
        key: this.apiKey!,
        mode: params.mode || 'driving',
        language: params.language || 'en',
        units: params.units || 'metric',
      };

      if (params.waypoints && params.waypoints.length > 0) {
        requestParams.waypoints = params.waypoints.join('|');
      }

      if (params.avoid && params.avoid.length > 0) {
        requestParams.avoid = params.avoid.join('|');
      }

      if (params.alternatives) {
        requestParams.alternatives = 'true';
      }

      const response = await this.axiosInstance.get('/directions/json', {
        params: requestParams,
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Google Maps API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      this.logger.error('Failed to get route:', error.message);
      throw error;
    }
  }

  /**
   * 计算距离矩阵
   */
  async computeDistanceMatrix(params: {
    origins: string[];
    destinations: string[];
    mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
    language?: string;
    units?: 'metric' | 'imperial';
    avoid?: ('tolls' | 'highways' | 'ferries')[];
    departureTime?: Date;
    arrivalTime?: Date;
  }): Promise<any> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Maps API Key not configured');
    }

    try {
      const requestParams: any = {
        origins: params.origins.join('|'),
        destinations: params.destinations.join('|'),
        key: this.apiKey!,
        mode: params.mode || 'driving',
        language: params.language || 'en',
        units: params.units || 'metric',
      };

      if (params.avoid && params.avoid.length > 0) {
        requestParams.avoid = params.avoid.join('|');
      }

      if (params.departureTime) {
        requestParams.departure_time = Math.floor(params.departureTime.getTime() / 1000);
      }

      if (params.arrivalTime) {
        requestParams.arrival_time = Math.floor(params.arrivalTime.getTime() / 1000);
      }

      const response = await this.axiosInstance.get('/distancematrix/json', {
        params: requestParams,
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Google Maps API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      this.logger.error('Failed to compute distance matrix:', error.message);
      throw error;
    }
  }

  /**
   * 地理编码（地址转坐标）
   */
  async geocode(params: {
    address?: string;
    latlng?: { lat: number; lng: number };
    language?: string;
    region?: string;
  }): Promise<any> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Maps API Key not configured');
    }

    try {
      const requestParams: any = {
        key: this.apiKey!,
        language: params.language || 'en',
      };

      if (params.address) {
        requestParams.address = params.address;
      }

      if (params.latlng) {
        requestParams.latlng = `${params.latlng.lat},${params.latlng.lng}`;
      }

      if (params.region) {
        requestParams.region = params.region;
      }

      const response = await this.axiosInstance.get('/geocode/json', {
        params: requestParams,
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Maps API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      this.logger.error('Failed to geocode:', error.message);
      throw error;
    }
  }

  /**
   * 搜索地点（文本搜索）
   */
  async searchPlaces(params: {
    query: string;
    location?: { lat: number; lng: number };
    radius?: number;
    language?: string;
    type?: string;
  }): Promise<any> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Maps API Key not configured');
    }

    try {
      const requestParams: any = {
        query: params.query,
        key: this.apiKey!,
        language: params.language || 'en',
      };

      if (params.location) {
        requestParams.location = `${params.location.lat},${params.location.lng}`;
      }

      if (params.radius) {
        requestParams.radius = params.radius;
      }

      if (params.type) {
        requestParams.type = params.type;
      }

      const response = await this.axiosInstance.get('/place/textsearch/json', {
        params: requestParams,
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Maps API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      this.logger.error('Failed to search places:', error.message);
      throw error;
    }
  }

  /**
   * 附近搜索
   */
  async nearbySearch(params: {
    location: { lat: number; lng: number };
    radius?: number;
    type?: string;
    keyword?: string;
    language?: string;
  }): Promise<any> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Maps API Key not configured');
    }

    try {
      const requestParams: any = {
        location: `${params.location.lat},${params.location.lng}`,
        key: this.apiKey!,
        radius: params.radius || 1000,
        language: params.language || 'en',
      };

      if (params.type) {
        requestParams.type = params.type;
      }

      if (params.keyword) {
        requestParams.keyword = params.keyword;
      }

      const response = await this.axiosInstance.get('/place/nearbysearch/json', {
        params: requestParams,
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Maps API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      this.logger.error('Failed to search nearby:', error.message);
      throw error;
    }
  }
}
