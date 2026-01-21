// src/agent/training/services/roll-connection-pool.service.ts

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * RollConnectionPoolService
 *
 * 职责：管理到 Bridge Service 的 HTTP 连接池
 */
@Injectable()
export class RollConnectionPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(RollConnectionPoolService.name);
  private readonly bridgeUrl: string;
  private readonly maxConnections: number;
  private readonly keepAlive: boolean;
  private readonly keepAliveTimeout: number;

  // HTTP Agent (Node.js 原生)
  private agent: any;

  constructor(private readonly configService: ConfigService) {
    this.bridgeUrl =
      this.configService.get<string>('ROLL_BRIDGE_URL') ||
      'http://localhost:8001';
    this.maxConnections = parseInt(
      this.configService.get<string>('ROLL_MAX_CONNECTIONS') || '10',
      10,
    );
    this.keepAlive = this.configService.get<boolean>('ROLL_KEEP_ALIVE') !== false;
    this.keepAliveTimeout = parseInt(
      this.configService.get<string>('ROLL_KEEP_ALIVE_TIMEOUT') || '5000',
      10,
    );

    this.initializeAgent();
  }

  /**
   * 初始化 HTTP Agent（连接池）
   */
  private initializeAgent(): void {
    // 使用 Node.js 的 http/https 模块创建 Agent
    const http = require('http');
    const https = require('https');
    const { URL } = require('url');

    const url = new URL(this.bridgeUrl);
    const isHttps = url.protocol === 'https:';

    const Agent = isHttps ? https.Agent : http.Agent;

    this.agent = new Agent({
      keepAlive: this.keepAlive,
      keepAliveMsecs: this.keepAliveTimeout,
      maxSockets: this.maxConnections,
      maxFreeSockets: Math.floor(this.maxConnections / 2),
      timeout: 10000,
    });

    this.logger.log(
      `[RollConnectionPool] 连接池初始化: maxConnections=${this.maxConnections}, keepAlive=${this.keepAlive}`,
    );
  }

  /**
   * 获取 HTTP Agent
   */
  getAgent(): any {
    return this.agent;
  }

  /**
   * 获取 Bridge Service URL
   */
  getBridgeUrl(): string {
    return this.bridgeUrl;
  }

  /**
   * 清理连接池
   */
  onModuleDestroy(): void {
    if (this.agent) {
      this.agent.destroy();
      this.logger.log('[RollConnectionPool] 连接池已清理');
    }
  }
}
