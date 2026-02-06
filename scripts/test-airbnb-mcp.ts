#!/usr/bin/env node

/**
 * Airbnb MCP 测试脚本
 * 
 * 测试 Airbnb MCP 客户端的连接和基本功能
 */

import { AirbnbMcpClient } from '../src/mcp/airbnb-client';

async function testAirbnbMcp() {
  const client = new AirbnbMcpClient();

  try {
    console.log('🔌 正在连接到 Airbnb MCP 服务器...\n');
    await client.connect();

    console.log('✅ 连接成功！\n');

    // 测试 1: 列出所有可用工具
    console.log('🛠️  测试 1: 列出所有可用工具');
    let tools: any = null;
    try {
      tools = await client.listTools();
      console.log(`找到 ${tools.tools?.length || 0} 个工具:`);
      if (tools.tools) {
        tools.tools.forEach((tool: any) => {
          console.log(`  - ${tool.name}: ${tool.description || '无描述'}`);
        });
      }
      console.log('✅ 测试 1 通过\n');
    } catch (error) {
      console.error('❌ 测试 1 失败:', error);
    }

    // 测试 2: 尝试调用一个工具（如果有的话）
    if (tools?.tools && tools.tools.length > 0) {
      const firstTool = tools.tools[0];
      console.log(`🧪 测试 2: 调用工具 "${firstTool.name}"`);
      try {
        // 根据工具的实际参数调用
        const result = await client.callTool(firstTool.name, {});
        console.log('结果:', JSON.stringify(result, null, 2));
        console.log('✅ 测试 2 通过\n');
      } catch (error: any) {
        if (error.message?.includes('required') || error.message?.includes('参数')) {
          console.log(`⚠️  工具需要参数，跳过测试: ${error.message}`);
        } else {
          console.error('❌ 测试 2 失败:', error);
        }
      }
    }

    console.log('🎉 所有测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    if (error instanceof Error) {
      console.error('错误信息:', error.message);
      console.error('堆栈:', error.stack);
    }
    process.exit(1);
  } finally {
    try {
      await client.disconnect();
    } catch (error) {
      // 忽略断开连接错误
    }
  }
}

// 运行测试
testAirbnbMcp().catch((error) => {
  console.error('❌ 未捕获的错误:', error);
  process.exit(1);
});
