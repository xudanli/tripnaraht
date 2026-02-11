// src/trips/decision/services/wearable-integration.service.ts
/**
 * Wearable Integration Service（可穿戴设备集成服务）
 * 
 * Phase 2 核心服务：
 * - Strava API 集成
 * - Garmin Connect 集成
 * - Apple Health / Google Fit 数据导入
 * 
 * @since 2026-02 Phase 2
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * 支持的数据源
 */
export type WearableProvider = 'STRAVA' | 'GARMIN' | 'APPLE_HEALTH' | 'GOOGLE_FIT' | 'MANUAL';

/**
 * OAuth 连接状态
 */
export interface OAuthConnection {
  userId: string;
  provider: WearableProvider;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string[];
  athleteId?: string;
  connectedAt: Date;
  lastSyncAt?: Date;
}

/**
 * 活动数据（标准化格式）
 */
export interface WearableActivity {
  id: string;
  provider: WearableProvider;
  externalId: string;
  
  // 基础信息
  name: string;
  type: 'HIKE' | 'RUN' | 'WALK' | 'BIKE' | 'OTHER';
  startDate: Date;
  endDate: Date;
  
  // 核心指标
  distanceM: number;
  elevationGainM: number;
  elevationLossM: number;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number;
  
  // 可选指标
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgPace?: number;  // 分钟/公里
  calories?: number;
  
  // 高级数据
  startLocation?: { lat: number; lng: number };
  endLocation?: { lat: number; lng: number };
  polyline?: string;  // 编码的路线
  
  // 元数据
  rawData?: Record<string, any>;
  importedAt: Date;
}

/**
 * 体能评估（基于可穿戴数据）
 */
export interface WearableFitnessEstimate {
  userId: string;
  provider: WearableProvider;
  estimatedAt: Date;
  
  // 评估结果
  estimatedMaxDailyAscentM: number;
  estimatedRollingAscent3DaysM: number;
  confidenceScore: number;  // 0-1
  
  // 依据
  activityCount: number;
  dataRangeDays: number;
  peakPerformance: {
    maxSingleDayAscentM: number;
    maxSingleDayDistanceKm: number;
    longestMovingTimeHours: number;
  };
}

/**
 * Strava API 响应类型
 */
interface StravaActivity {
  id: number;
  name: string;
  type: string;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  start_latlng?: [number, number];
  end_latlng?: [number, number];
  map?: { summary_polyline?: string };
}

@Injectable()
export class WearableIntegrationService {
  private readonly logger = new Logger(WearableIntegrationService.name);

  // OAuth 配置（应从环境变量读取）
  private readonly stravaConfig = {
    clientId: process.env.STRAVA_CLIENT_ID || '',
    clientSecret: process.env.STRAVA_CLIENT_SECRET || '',
    redirectUri: process.env.STRAVA_REDIRECT_URI || 'http://localhost:3000/api/v1/wearable/strava/callback',
    authUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    apiBaseUrl: 'https://www.strava.com/api/v3',
  };

  private readonly garminConfig = {
    consumerKey: process.env.GARMIN_CONSUMER_KEY || '',
    consumerSecret: process.env.GARMIN_CONSUMER_SECRET || '',
    // Garmin 使用 OAuth 1.0a
  };

  constructor(private readonly prisma: PrismaService) {}

  // ==================== OAuth 流程 ====================

  /**
   * 获取 Strava OAuth 授权 URL
   */
  getStravaAuthUrl(userId: string): string {
    const params = new URLSearchParams({
      client_id: this.stravaConfig.clientId,
      redirect_uri: this.stravaConfig.redirectUri,
      response_type: 'code',
      scope: 'read,activity:read_all',
      state: userId,  // 用于回调时识别用户
    });
    return `${this.stravaConfig.authUrl}?${params.toString()}`;
  }

  /**
   * 处理 Strava OAuth 回调
   */
  async handleStravaCallback(code: string, userId: string): Promise<OAuthConnection> {
    this.logger.log(`处理 Strava OAuth 回调: userId=${userId}`);

    // 交换授权码获取访问令牌
    const tokenResponse = await fetch(this.stravaConfig.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.stravaConfig.clientId,
        client_secret: this.stravaConfig.clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Strava OAuth 失败: ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
      athlete: { id: number };
    };

    const connection: OAuthConnection = {
      userId,
      provider: 'STRAVA',
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(tokenData.expires_at * 1000),
      scope: ['read', 'activity:read_all'],
      athleteId: String(tokenData.athlete.id),
      connectedAt: new Date(),
    };

    // 保存连接
    await this.saveConnection(connection);

    return connection;
  }

  /**
   * 刷新 Strava 访问令牌
   */
  async refreshStravaToken(userId: string): Promise<string> {
    const connection = await this.getConnection(userId, 'STRAVA');
    if (!connection) {
      throw new Error('未找到 Strava 连接');
    }

    const tokenResponse = await fetch(this.stravaConfig.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.stravaConfig.clientId,
        client_secret: this.stravaConfig.clientSecret,
        refresh_token: connection.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('刷新令牌失败');
    }

    const tokenData = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
    };

    // 更新连接
    await this.updateConnectionTokens(userId, 'STRAVA', {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(tokenData.expires_at * 1000),
    });

    return tokenData.access_token;
  }

  // ==================== 数据同步 ====================

  /**
   * 同步 Strava 活动
   */
  async syncStravaActivities(
    userId: string,
    options: { after?: Date; before?: Date; limit?: number } = {}
  ): Promise<WearableActivity[]> {
    const connection = await this.getConnection(userId, 'STRAVA');
    if (!connection) {
      throw new Error('未连接 Strava');
    }

    // 检查令牌是否过期
    let accessToken = connection.accessToken;
    if (new Date() > connection.expiresAt) {
      accessToken = await this.refreshStravaToken(userId);
    }

    // 构建查询参数
    const params = new URLSearchParams();
    if (options.after) params.set('after', String(Math.floor(options.after.getTime() / 1000)));
    if (options.before) params.set('before', String(Math.floor(options.before.getTime() / 1000)));
    params.set('per_page', String(options.limit || 50));

    // 获取活动
    const response = await fetch(
      `${this.stravaConfig.apiBaseUrl}/athlete/activities?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      throw new Error(`获取 Strava 活动失败: ${response.statusText}`);
    }

    const stravaActivities: StravaActivity[] = await response.json();

    // 转换为标准格式
    const activities: WearableActivity[] = stravaActivities
      .filter(a => ['Hike', 'Walk', 'Run'].includes(a.type))
      .map(a => this.convertStravaActivity(a));

    // 保存活动
    for (const activity of activities) {
      await this.saveActivity(userId, activity);
    }

    // 更新最后同步时间
    await this.updateLastSyncTime(userId, 'STRAVA');

    this.logger.log(`同步了 ${activities.length} 个 Strava 活动`);

    return activities;
  }

  /**
   * 转换 Strava 活动为标准格式
   */
  private convertStravaActivity(strava: StravaActivity): WearableActivity {
    const activityType = (): WearableActivity['type'] => {
      switch (strava.type) {
        case 'Hike': return 'HIKE';
        case 'Run': return 'RUN';
        case 'Walk': return 'WALK';
        case 'Ride': return 'BIKE';
        default: return 'OTHER';
      }
    };

    return {
      id: `strava_${strava.id}`,
      provider: 'STRAVA',
      externalId: String(strava.id),
      name: strava.name,
      type: activityType(),
      startDate: new Date(strava.start_date),
      endDate: new Date(new Date(strava.start_date).getTime() + strava.elapsed_time * 1000),
      distanceM: strava.distance,
      elevationGainM: strava.total_elevation_gain,
      elevationLossM: 0,  // Strava 不直接提供
      movingTimeSeconds: strava.moving_time,
      elapsedTimeSeconds: strava.elapsed_time,
      avgHeartRate: strava.average_heartrate,
      maxHeartRate: strava.max_heartrate,
      startLocation: strava.start_latlng ? { lat: strava.start_latlng[0], lng: strava.start_latlng[1] } : undefined,
      endLocation: strava.end_latlng ? { lat: strava.end_latlng[0], lng: strava.end_latlng[1] } : undefined,
      polyline: strava.map?.summary_polyline,
      rawData: strava as unknown as Record<string, any>,
      importedAt: new Date(),
    };
  }

  // ==================== 体能评估 ====================

  /**
   * 基于可穿戴数据评估体能
   */
  async estimateFitnessFromWearables(userId: string): Promise<WearableFitnessEstimate | null> {
    // 获取最近 90 天的活动
    const activities = await this.getUserActivities(userId, 90);

    if (activities.length < 3) {
      this.logger.warn(`用户 ${userId} 的活动数据不足，无法评估体能`);
      return null;
    }

    // 只考虑徒步和跑步活动
    const relevantActivities = activities.filter(a => 
      ['HIKE', 'RUN', 'WALK'].includes(a.type)
    );

    if (relevantActivities.length < 2) {
      return null;
    }

    // 计算峰值表现
    const maxSingleDayAscentM = Math.max(...relevantActivities.map(a => a.elevationGainM));
    const maxSingleDayDistanceKm = Math.max(...relevantActivities.map(a => a.distanceM / 1000));
    const longestMovingTimeHours = Math.max(...relevantActivities.map(a => a.movingTimeSeconds / 3600));

    // 计算平均表现
    const avgAscentM = relevantActivities.reduce((s, a) => s + a.elevationGainM, 0) / relevantActivities.length;

    // 评估最大日爬升能力
    // 使用峰值和平均值的加权平均
    const estimatedMaxDailyAscentM = Math.round(
      maxSingleDayAscentM * 0.6 + avgAscentM * 1.5 * 0.4
    );

    // 评估3天滚动爬升
    // 假设用户可以在3天内完成日均爬升的 2.5 倍
    const estimatedRollingAscent3DaysM = Math.round(estimatedMaxDailyAscentM * 2.5);

    // 计算置信度（基于数据量和一致性）
    const dataRangeDays = Math.ceil(
      (new Date().getTime() - Math.min(...relevantActivities.map(a => a.startDate.getTime()))) /
      (1000 * 60 * 60 * 24)
    );
    
    let confidenceScore = Math.min(1, relevantActivities.length / 10);
    if (dataRangeDays < 30) confidenceScore *= 0.8;
    if (dataRangeDays > 60) confidenceScore = Math.min(1, confidenceScore * 1.1);

    const estimate: WearableFitnessEstimate = {
      userId,
      provider: relevantActivities[0].provider,
      estimatedAt: new Date(),
      estimatedMaxDailyAscentM,
      estimatedRollingAscent3DaysM,
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      activityCount: relevantActivities.length,
      dataRangeDays,
      peakPerformance: {
        maxSingleDayAscentM,
        maxSingleDayDistanceKm: Math.round(maxSingleDayDistanceKm * 10) / 10,
        longestMovingTimeHours: Math.round(longestMovingTimeHours * 10) / 10,
      },
    };

    this.logger.log(
      `用户 ${userId} 体能评估: maxAscent=${estimatedMaxDailyAscentM}m, confidence=${confidenceScore}`
    );

    return estimate;
  }

  // ==================== 数据库操作 ====================

  private async saveConnection(connection: OAuthConnection): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO wearable_connections (
          user_id, provider, access_token, refresh_token, expires_at,
          scope, athlete_id, connected_at
        ) VALUES (
          ${connection.userId}, ${connection.provider}, ${connection.accessToken},
          ${connection.refreshToken}, ${connection.expiresAt}, ${connection.scope}::VARCHAR[],
          ${connection.athleteId}, ${connection.connectedAt}
        )
        ON CONFLICT (user_id, provider) DO UPDATE SET
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          expires_at = EXCLUDED.expires_at,
          athlete_id = EXCLUDED.athlete_id
      `;
    } catch (error: any) {
      this.logger.warn(`保存连接失败（表可能不存在）: ${error.message}`);
    }
  }

  private async getConnection(userId: string, provider: WearableProvider): Promise<OAuthConnection | null> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        access_token: string;
        refresh_token: string;
        expires_at: Date;
        scope: string[];
        athlete_id: string;
        connected_at: Date;
        last_sync_at: Date;
      }>>`
        SELECT * FROM wearable_connections
        WHERE user_id = ${userId} AND provider = ${provider}
      `;

      if (result.length === 0) return null;

      return {
        userId,
        provider,
        accessToken: result[0].access_token,
        refreshToken: result[0].refresh_token,
        expiresAt: result[0].expires_at,
        scope: result[0].scope,
        athleteId: result[0].athlete_id,
        connectedAt: result[0].connected_at,
        lastSyncAt: result[0].last_sync_at,
      };
    } catch {
      return null;
    }
  }

  private async updateConnectionTokens(
    userId: string,
    provider: WearableProvider,
    tokens: { accessToken: string; refreshToken: string; expiresAt: Date }
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE wearable_connections
      SET access_token = ${tokens.accessToken},
          refresh_token = ${tokens.refreshToken},
          expires_at = ${tokens.expiresAt}
      WHERE user_id = ${userId} AND provider = ${provider}
    `;
  }

  private async updateLastSyncTime(userId: string, provider: WearableProvider): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE wearable_connections SET last_sync_at = NOW()
      WHERE user_id = ${userId} AND provider = ${provider}
    `;
  }

  private async saveActivity(userId: string, activity: WearableActivity): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO wearable_activities (
          user_id, activity_id, provider, external_id, name, activity_type,
          start_date, end_date, distance_m, elevation_gain_m, elevation_loss_m,
          moving_time_seconds, elapsed_time_seconds, avg_heart_rate, max_heart_rate,
          polyline, raw_data, imported_at
        ) VALUES (
          ${userId}, ${activity.id}, ${activity.provider}, ${activity.externalId},
          ${activity.name}, ${activity.type}, ${activity.startDate}, ${activity.endDate},
          ${activity.distanceM}, ${activity.elevationGainM}, ${activity.elevationLossM},
          ${activity.movingTimeSeconds}, ${activity.elapsedTimeSeconds},
          ${activity.avgHeartRate}, ${activity.maxHeartRate}, ${activity.polyline},
          ${JSON.stringify(activity.rawData)}::JSONB, ${activity.importedAt}
        )
        ON CONFLICT (activity_id) DO NOTHING
      `;
    } catch (error: any) {
      this.logger.debug(`保存活动失败: ${error.message}`);
    }
  }

  private async getUserActivities(userId: string, days: number): Promise<WearableActivity[]> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        activity_id: string;
        provider: WearableProvider;
        external_id: string;
        name: string;
        activity_type: WearableActivity['type'];
        start_date: Date;
        end_date: Date;
        distance_m: number;
        elevation_gain_m: number;
        elevation_loss_m: number;
        moving_time_seconds: number;
        elapsed_time_seconds: number;
        avg_heart_rate: number;
        max_heart_rate: number;
        imported_at: Date;
      }>>`
        SELECT * FROM wearable_activities
        WHERE user_id = ${userId}
          AND start_date > NOW() - INTERVAL '${days} days'
        ORDER BY start_date DESC
      `;

      return result.map(r => ({
        id: r.activity_id,
        provider: r.provider,
        externalId: r.external_id,
        name: r.name,
        type: r.activity_type,
        startDate: r.start_date,
        endDate: r.end_date,
        distanceM: r.distance_m,
        elevationGainM: r.elevation_gain_m,
        elevationLossM: r.elevation_loss_m,
        movingTimeSeconds: r.moving_time_seconds,
        elapsedTimeSeconds: r.elapsed_time_seconds,
        avgHeartRate: r.avg_heart_rate,
        maxHeartRate: r.max_heart_rate,
        importedAt: r.imported_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * 获取用户连接的设备列表
   */
  async getUserConnections(userId: string): Promise<Array<{
    provider: WearableProvider;
    connected: boolean;
    lastSyncAt?: Date;
  }>> {
    try {
      const connections = await this.prisma.$queryRaw<Array<{
        provider: WearableProvider;
        last_sync_at: Date;
      }>>`
        SELECT provider, last_sync_at FROM wearable_connections WHERE user_id = ${userId}
      `;

      const allProviders: WearableProvider[] = ['STRAVA', 'GARMIN', 'APPLE_HEALTH', 'GOOGLE_FIT'];
      
      return allProviders.map(p => {
        const conn = connections.find(c => c.provider === p);
        return {
          provider: p,
          connected: !!conn,
          lastSyncAt: conn?.last_sync_at,
        };
      });
    } catch {
      return [];
    }
  }
}
