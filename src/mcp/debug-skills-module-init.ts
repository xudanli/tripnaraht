#!/usr/bin/env node

/**
 * 专门调试 SkillsModule 初始化过程
 * 
 * 添加详细的日志来定位 SkillsModule 初始化卡在哪里
 */

// 强制开启 MCP 模式相关开关
process.env.MCP_MODE = 'true';
process.env.DISABLE_REDIS = 'true';
process.env.ALLOW_NO_DATABASE = 'true';

// 启用详细日志
process.env.LOG_LEVEL = 'error,warn,log,debug,verbose';

// 在导入之前添加日志
console.error('🔍 [Debug] 开始调试 SkillsModule 初始化...\n');
console.error('🔍 [Debug] 环境变量检查:');
console.error(`  ENABLE_CONTEXT_ENGINE_MODULE=${process.env.ENABLE_CONTEXT_ENGINE_MODULE || 'undefined'}`);
console.error(`  ENABLE_DECISION_SKILLS=${process.env.ENABLE_DECISION_SKILLS || 'undefined'}`);
console.error(`  ENABLE_READINESS_MODULE=${process.env.ENABLE_READINESS_MODULE || 'undefined'}`);
console.error(`  ENABLE_PLACES_MODULE=${process.env.ENABLE_PLACES_MODULE || 'undefined'}`);
console.error(`  ENABLE_TRIPS_MODULE=${process.env.ENABLE_TRIPS_MODULE || 'undefined'}`);
console.error('');

async function debugSkillsModuleInit() {
  try {
    console.error('步骤 1: 导入 NestFactory...');
    const { NestFactory } = await import('@nestjs/core');
    console.error('✅ NestFactory 导入成功\n');

    console.error('步骤 2: 导入 McpAppModule...');
    const { McpAppModule } = await import('./mcp-app.module');
    console.error('✅ McpAppModule 导入成功\n');

    console.error('步骤 3: 创建应用上下文（带详细日志）...');
    console.error('   超时时间: 30 秒');
    console.error('   进度日志: 每 1 秒输出一次\n');
    
    const startTime = Date.now();
    
    // 添加更详细的日志钩子
    const originalLog = console.error;
    let lastLogTime = Date.now();
    
    // 拦截所有 console.error 输出，添加时间戳
    const logWithTimestamp = (...args: any[]) => {
      const now = Date.now();
      const elapsed = ((now - startTime) / 1000).toFixed(2);
      const sinceLastLog = ((now - lastLogTime) / 1000).toFixed(2);
      originalLog(`[${elapsed}s, +${sinceLastLog}s]`, ...args);
      lastLogTime = now;
    };
    
    const createContextPromise = NestFactory.createApplicationContext(McpAppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });
    
    // 添加进度日志（每 1 秒）
    const progressInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      logWithTimestamp(`⏳ [${elapsed}s] 仍在等待应用上下文创建...`);
    }, 1000);
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        clearInterval(progressInterval);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        reject(new Error(`创建应用上下文超时（${elapsed}秒）`));
      }, 30000);
    });
    
    try {
      const app = await Promise.race([createContextPromise, timeoutPromise]);
      clearInterval(progressInterval);
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.error(`✅ 应用上下文创建成功（耗时: ${elapsed}秒）\n`);
      
      console.error('步骤 4: 获取 SkillsRegistryService...');
      const { SKILLS_REGISTRY_TOKEN } = await import('../skills/services/skills-registry.token');
      const skillsRegistry = app.get(SKILLS_REGISTRY_TOKEN, { strict: false });
      
      if (!skillsRegistry) {
        throw new Error('SkillsRegistryService is null or undefined');
      }
      console.error('✅ SkillsRegistryService 获取成功\n');
      
      console.error('步骤 5: 获取所有 Skills...');
      const allSkills = skillsRegistry.getAllSkills();
      console.error(`✅ 找到 ${allSkills.length} 个 Skills\n`);
      
      console.error('✅ 诊断完成：MCP Server 可以正常启动！');
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

debugSkillsModuleInit();
