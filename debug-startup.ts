// debug-startup.ts
/**
 * Node.js 调试脚本 - 用于定位启动阻塞问题
 * 
 * 使用方法:
 * 1. node --inspect-brk debug-startup.ts
 * 2. 在 Chrome DevTools 中连接到 chrome://inspect
 * 3. 在 SkillsModule 和 SkillsRegistryService 构造函数处设置断点
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

async function debugBootstrap() {
  console.log('[DEBUG] 开始创建 NestFactory...');
  const startTime = Date.now();
  
  try {
    const app = await Promise.race([
      NestFactory.create(AppModule, {
        logger: ['error', 'warn', 'log', 'debug', 'verbose'],
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('NestFactory.create() 超时 (60秒)')), 60000)
      ),
    ]);
    
    const elapsed = Date.now() - startTime;
    console.log(`[DEBUG] ✅ NestFactory 创建成功 (耗时: ${elapsed}ms)`);
    
    await app.close();
    process.exit(0);
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[DEBUG] ❌ NestFactory 创建失败 (耗时: ${elapsed}ms):`, error.message);
    console.error('[DEBUG] 堆栈跟踪:', error.stack);
    process.exit(1);
  }
}

debugBootstrap();
