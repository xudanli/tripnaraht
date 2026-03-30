#!/usr/bin/env node

/**
 * 调试 OnModuleInit 钩子
 * 
 * 添加详细的日志来定位哪个模块的 OnModuleInit 阻塞了
 */

// 强制开启 MCP 模式相关开关
process.env.MCP_MODE = 'true';
process.env.DISABLE_REDIS = 'true';
process.env.ALLOW_NO_DATABASE = 'true';

// 启用详细日志
process.env.LOG_LEVEL = 'error,warn,log,debug,verbose';

async function debugOnModuleInit() {
  console.error('🔍 开始调试 OnModuleInit 钩子...\n');

  try {
    // 在导入 NestJS 之前，拦截 OnModuleInit
    const { NestFactory } = await import('@nestjs/core');
    
    // 获取 NestJS 的内部模块初始化器
    const { Module } = await import('@nestjs/common');
    
    // 创建一个包装器来拦截 OnModuleInit
    const originalModuleInit = (Module as any).prototype.onModuleInit;
    if (originalModuleInit) {
      (Module as any).prototype.onModuleInit = function(...args: any[]) {
        console.error(`🔍 [OnModuleInit] 调用: ${this.constructor.name}`);
        const startTime = Date.now();
        try {
          const result = originalModuleInit.apply(this, args);
          if (result && typeof result.then === 'function') {
            return result.then(
              (res: any) => {
                const duration = Date.now() - startTime;
                console.error(`✅ [OnModuleInit] 完成: ${this.constructor.name} (耗时: ${duration}ms)`);
                return res;
              },
              (err: any) => {
                const duration = Date.now() - startTime;
                console.error(`❌ [OnModuleInit] 失败: ${this.constructor.name} (耗时: ${duration}ms) - ${err.message}`);
                throw err;
              }
            );
          } else {
            const duration = Date.now() - startTime;
            console.error(`✅ [OnModuleInit] 完成: ${this.constructor.name} (耗时: ${duration}ms)`);
            return result;
          }
        } catch (error: any) {
          const duration = Date.now() - startTime;
          console.error(`❌ [OnModuleInit] 异常: ${this.constructor.name} (耗时: ${duration}ms) - ${error.message}`);
          throw error;
        }
      };
    }

    console.error('步骤 1: 导入 McpAppModule...');
    const { McpAppModule } = await import('./mcp-app.module');
    console.error('✅ McpAppModule 导入成功\n');

    console.error('步骤 2: 创建应用上下文（带 OnModuleInit 日志）...');
    console.error('   超时时间: 30 秒');
    console.error('   进度日志: 每 2 秒输出一次\n');
    
    const startTime = Date.now();
    const createContextPromise = NestFactory.createApplicationContext(McpAppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });
    
    // 添加进度日志
    const progressInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.error(`⏳ [${elapsed}s] 仍在等待应用上下文创建...`);
    }, 2000);
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        clearInterval(progressInterval);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        reject(new Error(`创建应用上下文超时（${elapsed}秒）`));
      }, 30000);
    });
    
    try {
      const _app = await Promise.race([createContextPromise, timeoutPromise]);
      clearInterval(progressInterval);
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.error(`✅ 应用上下文创建成功（耗时: ${elapsed}秒）\n`);
      process.exit(0);
    } catch (error: any) {
      clearInterval(progressInterval);
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.error(`\n❌ 诊断失败（耗时: ${elapsed}秒）`);
      console.error(`错误: ${error.message}`);
      if (error.stack) {
        console.error(`堆栈:\n${error.stack}`);
      }
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`\n❌ 诊断过程出错`);
    console.error(`错误: ${error.message}`);
    if (error.stack) {
      console.error(`堆栈:\n${error.stack}`);
    }
    process.exit(1);
  }
}

debugOnModuleInit();
