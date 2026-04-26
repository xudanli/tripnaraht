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
    
    // 检查是否有 DATABASE_URL（如果没有，也应该跳过连接）
    const databaseUrl = this.configService?.get<string>('DATABASE_URL') || process.env.DATABASE_URL;
    const allowNoDb = !databaseUrl ||
                      this.configService?.get<string>('ALLOW_NO_DATABASE') === 'true' ||
                      process.env.ALLOW_NO_DATABASE === 'true' ||
                      isMcpMode;
    
    this.skipConnection = allowNoDb;
    
    if (this.skipConnection) {
      if (!databaseUrl) {
        this.logger.warn('PrismaService: DATABASE_URL 未设置，跳过数据库连接');
      } else {
        this.logger.warn('PrismaService: Skipping database connection (MCP/test mode)');
      }
    }
  }

  async onModuleInit() {
    // 使用 console.log 确保日志能输出（即使 Logger 有问题）
    console.log('🔌 [Prisma] PrismaService onModuleInit called - START');
    this.logger.log('🔌 [Prisma] PrismaService onModuleInit called');
    
    if (this.skipConnection) {
      console.log('⚠️ [Prisma] Skipping database connection (MCP/test mode)');
      this.logger.warn('⚠️ [Prisma] Skipping database connection (MCP/test mode)');
      console.log('🔌 [Prisma] PrismaService onModuleInit called - END (skipConnection)');
      return;
    }
    
    // 检查是否有 DATABASE_URL
    const databaseUrl = this.configService?.get<string>('DATABASE_URL') || process.env.DATABASE_URL;
    if (!databaseUrl) {
      this.logger.warn('⚠️ [Prisma] DATABASE_URL 未设置，跳过数据库连接');
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
      // 同时在后台继续尝试连接：Prisma 会在首次查询时自动建连，但我们需要把 isConnected 置为 true
      // 以避免业务层因 isDbConnected=false 而错误地返回空数据（例如 admin 列表接口）。
      this.$connect()
        .then(() => {
          this.isConnected = true;
          this.logger.log('✅ [Prisma] 后台重连成功');
        })
        .catch((err: any) => {
          this.logger.warn(`⚠️ [Prisma] 后台重连失败: ${err?.message || String(err)}`);
        });
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

