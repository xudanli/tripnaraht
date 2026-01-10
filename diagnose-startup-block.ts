// 诊断启动阻塞问题
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

async function diagnose() {
  console.log('🔍 开始诊断启动阻塞问题...\n');
  
  const startTime = Date.now();
  
  try {
    console.log('步骤 1: 创建 NestFactory...');
    const createPromise = NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug'],
    });
    
    // 设置超时
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('NestFactory.create() 超时（30秒）'));
      }, 30000);
    });
    
    console.log('步骤 2: 等待 NestFactory.create() 完成...');
    const app = await Promise.race([createPromise, timeoutPromise]);
    const duration = Date.now() - startTime;
    
    console.log(`✅ NestFactory.create() 完成！耗时: ${duration}ms\n`);
    
    console.log('步骤 3: 检查应用状态...');
    console.log(`应用已创建: ${app !== null}`);
    
    console.log('\n✅ 诊断完成：应用可以正常启动！');
    
    // 清理
    await app.close();
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`\n❌ 诊断失败（耗时: ${duration}ms）:`);
    console.error(`错误: ${error.message}`);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
    process.exit(1);
  }
}

diagnose();
