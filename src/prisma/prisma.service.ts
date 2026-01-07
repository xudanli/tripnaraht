// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private isConnected = false;
  private readonly skipConnection: boolean;

  constructor(private configService?: ConfigService) {
    super();
    
    // 在构造函数中检查是否在 MCP 模式下（通过环境变量或进程名判断）
    const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
                      process.env.MCP_MODE === 'true';
    const allowNoDb = this.configService?.get<string>('ALLOW_NO_DATABASE') === 'true' ||
                      process.env.ALLOW_NO_DATABASE === 'true' ||
                      isMcpMode;
    
    this.skipConnection = allowNoDb;
    
    if (this.skipConnection) {
      this.logger.warn('PrismaService: Skipping database connection (MCP/test mode)');
    }
  }

  async onModuleInit() {
    this.logger.log('🔌 [Prisma] PrismaService onModuleInit called');
    
    if (this.skipConnection) {
      this.logger.warn('⚠️ [Prisma] Skipping database connection (MCP/test mode)');
      return;
    }
    
    this.logger.log('🔌 [Prisma] 正在尝试连接...');
    
    // 创建一个 2秒 的超时计时器
    const timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Connection Timeout')), 2000)
    );

    try {
      // 让连接操作和计时器赛跑
      await Promise.race([this.$connect(), timeout]);
      this.isConnected = true;
      this.logger.log('✅ [Prisma] 连接成功');
    } catch (e: any) {
      const errorMessage = e?.message || String(e);
      this.logger.warn(`⚠️ [Prisma] 连接超时或失败，跳过数据库连接，继续启动 App。错误: ${errorMessage}`);
      // 重点：这里捕获了错误，但没有 throw，所以 App 能够继续启动！
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

