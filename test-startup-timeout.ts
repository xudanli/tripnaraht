// 测试启动超时问题
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

async function testStartup() {
  // 设置环境变量，避免数据库连接阻塞
  process.env.ALLOW_NO_DATABASE = 'true';
  
  console.log('🚀 开始测试应用启动...');
  const startTime = Date.now();
  
  try {
    // 设置超时
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`启动超时（60秒）`));
      }, 60000);
    });
    
    const createPromise = NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug'],
    });
    
    console.log('⏳ 等待 NestFactory.create() 完成...');
    const app = await Promise.race([createPromise, timeoutPromise]);
    const duration = Date.now() - startTime;
    
    console.log(`✅ 应用创建成功！耗时: ${duration}ms`);
    console.log('🌐 开始监听端口...');
    
    const port = 3000;
    await app.listen(port, '0.0.0.0');
    console.log(`✅ API listening on http://0.0.0.0:${port}`);
    
    // 保持运行
    console.log('应用正在运行，按 Ctrl+C 停止...');
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ 启动失败（耗时: ${duration}ms）:`, error.message);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
    process.exit(1);
  }
}

testStartup();
