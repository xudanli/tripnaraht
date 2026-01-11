#!/usr/bin/env node

/**
 * 诊断启动阻塞问题 - 使用二分法定位阻塞模块
 * 
 * 应用在 RouteDirectionsModule dependencies initialized 后卡住
 * 使用二分法逐步禁用模块来定位问题
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

// 设置环境变量
process.env.DISABLE_REDIS = 'true';
process.env.ALLOW_NO_DATABASE = 'true';

const TIMEOUT = 30000; // 30 秒超时

async function testStartup(testName: string, timeout: number = TIMEOUT): Promise<boolean> {
  console.log(`\n🔍 测试: ${testName}`);
  console.log(`   超时时间: ${timeout}ms`);
  
  const startTime = Date.now();
  
  try {
    const createPromise = NestFactory.create(AppModule, {
      logger: ['error', 'warn'],
    });
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`超时（${timeout}ms）`));
      }, timeout);
    });
    
    const app = await Promise.race([createPromise, timeoutPromise]);
    const duration = Date.now() - startTime;
    
    console.log(`✅ ${testName} - 成功（耗时: ${duration}ms）`);
    await app.close();
    return true;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    if (error.message.includes('超时')) {
      console.log(`❌ ${testName} - 超时（耗时: ${duration}ms）`);
      return false;
    } else {
      console.log(`❌ ${testName} - 失败（耗时: ${duration}ms）: ${error.message}`);
      return false;
    }
  }
}

async function diagnose() {
  console.log('🔍 开始诊断启动阻塞问题...\n');
  console.log('应用在 RouteDirectionsModule dependencies initialized 后卡住\n');
  
  // 测试 1: 完整应用
  console.log('═══════════════════════════════════════');
  console.log('测试 1: 完整应用（所有模块启用）');
  console.log('═══════════════════════════════════════');
  const fullAppWorks = await testStartup('完整应用', TIMEOUT);
  
  if (!fullAppWorks) {
    console.log('\n❌ 完整应用启动超时，需要进一步诊断');
    console.log('\n建议：');
    console.log('1. 查看日志，确认卡在哪个模块初始化');
    console.log('2. 手动禁用可疑模块（如 RagModule）');
    console.log('3. 检查 DecisionModule 中的条件导入模块');
  } else {
    console.log('\n✅ 完整应用可以正常启动！');
  }
  
  console.log('\n═══════════════════════════════════════');
  console.log('诊断完成');
  console.log('═══════════════════════════════════════');
}

diagnose().catch(error => {
  console.error('诊断失败:', error);
  process.exit(1);
});
