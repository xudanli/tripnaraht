#!/usr/bin/env node

/**
 * MCP Server 启动超时诊断脚本
 * 
 * 用于定位 createApplicationContext 超时的具体原因
 */

// 强制开启 MCP 模式相关开关
process.env.MCP_MODE = 'true';
process.env.DISABLE_REDIS = 'true';
process.env.ALLOW_NO_DATABASE = 'true';

// 启用详细日志
process.env.LOG_LEVEL = 'error,warn,log,debug,verbose';

async function diagnose() {
  console.error('🔍 开始诊断 MCP Server 启动超时问题...\n');

  try {
    console.error('步骤 1: 导入 NestFactory...');
    const { NestFactory } = await import('@nestjs/core');
    console.error('✅ NestFactory 导入成功\n');

    console.error('步骤 2: 导入 McpAppModule...');
    const { McpAppModule } = await import('./mcp-app.module');
    console.error('✅ McpAppModule 导入成功\n');

    console.error('步骤 3: 创建应用上下文（带超时和进度日志）...');
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

diagnose();
