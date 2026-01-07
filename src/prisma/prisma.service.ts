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
    this.logger.log('PrismaService onModuleInit called');
    
    // 检查是否在 MCP 模式下（通过环境变量或进程名判断）
    const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
                      process.env.MCP_MODE === 'true';
    const allowNoDb = this.configService?.get<string>('ALLOW_NO_DATABASE') === 'true' ||
                      process.env.ALLOW_NO_DATABASE === 'true' ||
                      isMcpMode;
    
    if (allowNoDb) {
      this.logger.warn('Skipping database connection (MCP/test mode)');
      return;
    }
    
    try {
      this.logger.log('Attempting database connection...');
      // 设置连接超时（3秒，更短）
      const connectPromise = this.$connect();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Database connection timeout (3s)')), 3000);
      });
      
      await Promise.race([connectPromise, timeoutPromise]);
      this.isConnected = true;
      this.logger.log('Database connection established');
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      this.logger.warn(`Failed to connect to database: ${errorMessage}`);
      
      // 在 MCP 模式下，不抛出错误
      if (isMcpMode) {
        this.logger.warn('Continuing without database connection (MCP mode)');
      } else if (allowNoDb) {
        this.logger.warn('Continuing without database connection (test mode)');
      } else {
        this.logger.error('Database connection is required. Set ALLOW_NO_DATABASE=true to allow running without database.');
        throw error;
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

