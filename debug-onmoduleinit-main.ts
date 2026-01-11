#!/usr/bin/env node

/**
 * 调试主应用的 OnModuleInit 钩子
 * 
 * 添加详细的日志来定位哪个模块的 OnModuleInit 阻塞了
 */

// 强制开启相关开关
process.env.DISABLE_REDIS = 'true';
process.env.ALLOW_NO_DATABASE = 'true';

// 启用详细日志
process.env.LOG_LEVEL = 'error,warn,log,debug,verbose';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

async function debugOnModuleInit() {
  console.error('🔍 开始调试主应用的 OnModuleInit 钩子...\n');

  try {
    console.error('步骤 1: 导入 AppModule...');
    console.error('✅ AppModule 导入成功\n');

    console.error('步骤 2: 创建应用（带 OnModuleInit 日志）...');
    console.error('   超时时间: 60 秒');
    console.error('   进度日志: 每 2 秒输出一次\n');
    
    const startTime = Date.now();
    const createPromise = NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });
    
    // 添加进度日志
    const progressInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.error(`⏳ [${elapsed}s] 仍在等待应用创建...`);
    }, 2000);
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        clearInterval(progressInterval);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        reject(new Error(`创建应用超时（${elapsed}秒）`));
      }, 60000);
    });
    
    try {
      const app = await Promise.race([createPromise, timeoutPromise]);
      clearInterval(progressInterval);
      const duration = Date.now() - startTime;
      console.error(`\n✅ 应用创建成功 (耗时: ${duration}ms)`);
      await app.close();
      process.exit(0);
    } catch (error: any) {
      clearInterval(progressInterval);
      const duration = Date.now() - startTime;
      console.error(`\n❌ 应用创建失败 (耗时: ${duration}ms)`);
      console.error(`错误: ${error.message}`);
      if (error.stack) {
        console.error(`堆栈: ${error.stack}`);
      }
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`\n❌ 调试脚本执行失败: ${error.message}`);
    if (error.stack) {
      console.error(`堆栈: ${error.stack}`);
    }
    process.exit(1);
  }
}

debugOnModuleInit();
