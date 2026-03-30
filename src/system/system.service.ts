// src/system/system.service.ts
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 系统状态服务
 * 
 * 返回系统能力/状态信息，用于前端提示"某能力暂不可用"
 */
@Injectable()
export class SystemService {
  constructor(@Optional() private configService?: ConfigService) {}

  /**
   * 获取系统状态
   */
  getStatus() {
    return {
      ocrProvider: this.getOcrProvider(),
      poiProvider: this.getPoiProvider(),
      asrProvider: this.getAsrProvider(),
      ttsProvider: this.getTtsProvider(),
      llmProvider: this.getLlmProvider(),
      rateLimit: {
        enabled: false,
        remaining: null,
        resetAt: null,
      },
      features: {
        vision: {
          enabled: true,
          maxFileSize: 6 * 1024 * 1024, // 6MB
          supportedFormats: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
        },
        voice: {
          enabled: true,
          asrEnabled: true,
          ttsEnabled: true,
        },
        whatIf: {
          enabled: true,
          maxSamples: 1000,
        },
      },
    };
  }

  /**
   * 获取 OCR Provider 状态
   */
  private getOcrProvider(): 'mock' | 'google' | 'unavailable' {
    const apiKey = this.configService?.get<string>('GOOGLE_VISION_API_KEY');
    return apiKey ? 'google' : 'mock';
  }

  /**
   * 获取 POI Provider 状态
   */
  private getPoiProvider(): 'mock' | 'google' | 'osm' | 'unavailable' {
    const googleKey = this.configService?.get<string>('GOOGLE_PLACES_API_KEY');
    if (googleKey) return 'google';
    // 可以检查 OSM 配置
    return 'mock';
  }

  /**
   * 获取 ASR Provider 状态
   */
  private getAsrProvider(): 'mock' | 'openai' | 'google' | 'azure' | 'unavailable' {
    const openaiKey = this.configService?.get<string>('OPENAI_API_KEY');
    if (openaiKey) return 'openai';
    const googleKey = this.configService?.get<string>('GOOGLE_SPEECH_API_KEY');
    if (googleKey) return 'google';
    return 'mock';
  }

  /**
   * 获取 TTS Provider 状态
   */
  private getTtsProvider(): 'mock' | 'openai' | 'google' | 'azure' | 'unavailable' {
    const openaiKey = this.configService?.get<string>('OPENAI_API_KEY');
    if (openaiKey) return 'openai';
    const googleKey = this.configService?.get<string>('GOOGLE_TTS_API_KEY');
    if (googleKey) return 'google';
    return 'mock';
  }

  /**
   * 获取 LLM Provider 状态
   */
  private getLlmProvider(): 'mock' | 'openai' | 'anthropic' | 'google' | 'unavailable' {
    const openaiKey = this.configService?.get<string>('OPENAI_API_KEY');
    if (openaiKey) return 'openai';
    const anthropicKey = this.configService?.get<string>('ANTHROPIC_API_KEY');
    if (anthropicKey) return 'anthropic';
    const googleKey = this.configService?.get<string>('GOOGLE_AI_API_KEY');
    if (googleKey) return 'google';
    return 'mock';
  }

  /**
   * 获取系统指标（管理接口）
   */
  async getAdminMetrics() {
    // TODO: 实现真实的系统指标收集
    // 这里返回模拟数据，实际应该从监控系统获取
    return {
      system: {
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0,
        uptime: process.uptime(),
      },
      api: {
        totalRequests: 0,
        requestsPerSecond: 0,
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        errorRate: 0,
        successRate: 1,
      },
      database: {
        connectionPoolSize: 0,
        activeConnections: 0,
        idleConnections: 0,
        queryCount: 0,
        avgQueryTime: 0,
        slowQueries: 0,
      },
      cache: {
        hitRate: 0,
        missRate: 0,
        totalKeys: 0,
        memoryUsage: 0,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 获取性能指标（管理接口）
   */
  async getAdminPerformance(_options?: {
    startTime?: Date;
    endTime?: Date;
    granularity?: 'hour' | 'day';
  }) {
    // TODO: 实现真实的性能指标收集
    return {
      timeSeries: [],
      summary: {
        peakRequestsPerSecond: 0,
        peakResponseTime: 0,
        peakErrorRate: 0,
      },
    };
  }

  /**
   * 获取错误日志统计（管理接口）
   */
  async getAdminErrors(_options?: {
    startTime?: Date;
    endTime?: Date;
    level?: 'error' | 'warn';
  }) {
    // TODO: 实现真实的错误日志统计
    return {
      summary: {
        totalErrors: 0,
        errorRate: 0,
        uniqueErrors: 0,
      },
      byType: {},
      topErrors: [],
      trends: {
        errorsByHour: [],
      },
    };
  }

  /**
   * 获取请求统计（管理接口）
   */
  async getAdminRequests(_options?: {
    startTime?: Date;
    endTime?: Date;
    granularity?: 'hour' | 'day';
  }) {
    // TODO: 实现真实的请求统计
    // 实际应该从请求日志或监控系统获取
    return {
      summary: {
        totalRequests: 0,
        requestsPerSecond: 0,
        uniqueUsers: 0,
        uniqueIPs: 0,
      },
      byEndpoint: [],
      byMethod: {
        GET: 0,
        POST: 0,
        PUT: 0,
        DELETE: 0,
        PATCH: 0,
      },
      byStatus: {
        '2xx': 0,
        '3xx': 0,
        '4xx': 0,
        '5xx': 0,
      },
      timeSeries: [],
    };
  }

  /**
   * 获取数据库状态（管理接口）
   */
  async getAdminDatabase() {
    // TODO: 实现真实的数据库状态查询
    // 实际应该从 Prisma 连接池获取状态
    return {
      connectionPool: {
        size: 0,
        active: 0,
        idle: 0,
        waiting: 0,
      },
      queries: {
        total: 0,
        avgTime: 0,
        slowQueries: 0,
        slowQueryThreshold: 1000, // ms
      },
      tables: {
        total: 0,
        largest: [],
      },
      health: {
        status: 'healthy',
        lastCheck: new Date().toISOString(),
      },
    };
  }

  /**
   * 获取缓存状态（管理接口）
   */
  async getAdminCache() {
    // TODO: 实现真实的缓存状态查询
    // 实际应该从 Redis 或其他缓存系统获取状态
    return {
      status: 'connected',
      hitRate: 0,
      missRate: 0,
      totalKeys: 0,
      memoryUsage: {
        used: 0,
        max: 0,
        percentage: 0,
      },
      operations: {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
      },
      topKeys: [],
      evictions: 0,
    };
  }
}
