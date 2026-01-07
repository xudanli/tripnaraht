// 诊断脚本：检查 MCP Server 启动时哪里卡住了
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 设置 MCP 模式
process.env.MCP_MODE = 'true';
process.argv.push('mcp-skills-server');

console.log('🔍 开始诊断 MCP Server 启动超时问题...\n');

async function diagnose() {
  const steps: Array<{ name: string; fn: () => Promise<any> }> = [
    {
      name: '导入 NestFactory',
      fn: async () => {
        const { NestFactory } = await import('@nestjs/core');
        return NestFactory;
      },
    },
    {
      name: '导入 McpAppModule',
      fn: async () => {
        const { McpAppModule } = await import('./mcp-app.module');
        return McpAppModule;
      },
    },
    {
      name: '创建应用上下文（5秒超时）',
      fn: async () => {
        const { NestFactory } = await import('@nestjs/core');
        const { McpAppModule } = await import('./mcp-app.module');
        
        const createPromise = NestFactory.createApplicationContext(McpAppModule, {
          logger: ['error', 'warn'],
        });
        
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('超时（5秒）')), 5000);
        });
        
        return Promise.race([createPromise, timeoutPromise]);
      },
    },
  ];

  for (const step of steps) {
    console.log(`\n📋 步骤: ${step.name}`);
    const startTime = Date.now();
    try {
      const result = await step.fn();
      const duration = Date.now() - startTime;
      console.log(`✅ 成功 (${duration}ms)`);
      if (step.name.includes('应用上下文')) {
        console.log('✅ 应用上下文创建成功！');
        await (result as any).close();
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ 失败 (${duration}ms):`, error.message);
      if (error.stack) {
        console.error('堆栈:', error.stack);
      }
      break;
    }
  }
}

diagnose().catch(console.error);

