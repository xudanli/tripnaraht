// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private isConnected = false;

  constructor(private configService?: ConfigService) {
    super();
  }

  async onModuleInit() {
    try {
      // 设置连接超时（5秒）
      const connectPromise = this.$connect();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database connection timeout (5s)')), 5000);
      });
      
      await Promise.race([connectPromise, timeoutPromise]);
      this.isConnected = true;
      this.logger.log('Database connection established');
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      this.logger.warn(`Failed to connect to database: ${errorMessage}`);
      
      // 在测试模式或允许无数据库模式下，不抛出错误
      const allowNoDb = this.configService?.get<string>('ALLOW_NO_DATABASE') === 'true' ||
                        process.env.ALLOW_NO_DATABASE === 'true';
      if (!allowNoDb) {
        this.logger.error('Database connection is required. Set ALLOW_NO_DATABASE=true to allow running without database.');
        // 不抛出错误，而是继续运行（MCP Server 可能不需要数据库）
        this.logger.warn('Continuing without database connection (MCP mode)');
      } else {
        this.logger.warn('Continuing without database connection (test mode)');
      }
    }
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      try {
        await this.$disconnect();
        this.logger.log('Database connection closed');
      } catch (error: any) {
        this.logger.warn(`Error disconnecting from database: ${error?.message || String(error)}`);
      }
    }
  }

  /**
   * 检查数据库是否已连接
   */
  isDbConnected(): boolean {
    return this.isConnected;
  }
}

