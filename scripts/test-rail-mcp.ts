#!/usr/bin/env node

/**
 * 测试 Rail MCP 集成
 * 
 * 验证 Rail 客户端和工具是否正常工作
 */

import { getRailClient } from '../src/mcp/rail-client';

async function testRailIntegration() {
  console.log('🧪 开始测试 Rail MCP 集成...\n');

  const client = getRailClient();

  try {
    // 测试连接
    console.log('1️⃣ 测试连接到 Rail MCP 服务器...');
    await client.connect();
    console.log('✅ 连接成功\n');

    // 测试列出工具
    console.log('2️⃣ 测试列出可用工具...');
    const tools = await client.listTools();
    console.log('可用工具数量:', tools.tools?.length || 0);
    if (tools.tools && tools.tools.length > 0) {
      console.log('工具列表:');
      tools.tools.forEach((tool: any) => {
        console.log(`  - ${tool.name}: ${tool.description || 'No description'}`);
      });
    }
    console.log('✅ 工具列表获取成功\n');

    // 如果有工具，测试调用第一个工具
    if (tools.tools && tools.tools.length > 0) {
      const firstTool = tools.tools[0];
      console.log(`3️⃣ 测试调用工具: ${firstTool.name}`);
      console.log('工具描述:', firstTool.description || 'No description');
      console.log('工具参数:', JSON.stringify(firstTool.inputSchema || {}, null, 2));
      
      // 注意：这里不实际调用工具，因为不知道需要什么参数
      console.log('⚠️  跳过实际调用（需要具体参数）');
      console.log('✅ 工具信息获取成功\n');
    }

    console.log('🎉 所有测试通过！');
  } catch (error: any) {
    console.error('❌ 测试失败:', error);
    if (error.message) {
      console.error('错误信息:', error.message);
    }
    if (error.stack) {
      console.error('堆栈跟踪:', error.stack);
    }
    process.exit(1);
  } finally {
    // 断开连接
    console.log('4️⃣ 断开连接...');
    await client.disconnect();
    console.log('✅ 已断开连接');
  }
}

// 运行测试
testRailIntegration().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
