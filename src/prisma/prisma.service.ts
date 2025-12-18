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
      await this.$connect();
      this.isConnected = true;
      this.logger.log('Database connection established');
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      this.logger.warn(`Failed to connect to database: ${errorMessage}`);
      
      // 在测试模式或允许无数据库模式下，不抛出错误
      const allowNoDb = this.configService?.get<string>('ALLOW_NO_DATABASE') === 'true';
      if (!allowNoDb) {
        this.logger.error('Database connection is required. Set ALLOW_NO_DATABASE=true to allow running without database.');
        throw error;
      }
      
      this.logger.warn('Continuing without database connection (test mode)');
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

