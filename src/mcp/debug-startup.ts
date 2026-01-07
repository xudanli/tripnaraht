#!/usr/bin/env node

/**
 * 调试 MCP Server 启动过程
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function debugStartup() {
  console.error('🔍 开始调试 MCP Server 启动过程...\n');

  try {
    console.error('步骤 1: 导入 NestFactory...');
    const { NestFactory } = await import('@nestjs/core');
    console.error('✅ NestFactory 导入成功');

    console.error('步骤 2: 导入 McpAppModule...');
    const { McpAppModule } = await import('./mcp-app.module');
    console.error('✅ McpAppModule 导入成功');

    console.error('步骤 3: 创建应用上下文...');
    const app = await NestFactory.createApplicationContext(McpAppModule, {
      logger: ['error', 'warn', 'log'],
    });
    console.error('✅ 应用上下文创建成功');

    console.error('步骤 4: 获取 SkillsRegistryService...');
    const { SkillsRegistryService } = await import('../skills/services/skills-registry.service');
    const skillsRegistry = app.get(SkillsRegistryService, { strict: false });
    
    if (!skillsRegistry) {
      throw new Error('SkillsRegistryService is null or undefined');
    }
    console.error('✅ SkillsRegistryService 获取成功');

    console.error('步骤 5: 获取所有 Skills...');
    const allSkills = skillsRegistry.getAllSkills();
    console.error(`✅ 找到 ${allSkills.length} 个 Skills`);

    console.error('步骤 6: 创建 MCP Server...');
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const server = new McpServer(
      {
        name: 'tripnara-route-intel',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );
    console.error('✅ MCP Server 创建成功');

    console.error('步骤 7: 注册工具...');
    for (const skill of allSkills) {
      const toolName = `tripnara.${skill.metadata.name}`;
      console.error(`  注册工具: ${toolName}`);
      // 这里不实际注册，只是测试
    }
    console.error('✅ 工具注册测试成功');

    console.error('\n✅ 所有步骤都成功！服务器应该可以正常启动。');
    
    // 清理
    await app.close();
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ 调试失败:', error);
    if (error.message) {
      console.error('错误消息:', error.message);
    }
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
    process.exit(1);
  }
}

debugStartup().catch(console.error);

