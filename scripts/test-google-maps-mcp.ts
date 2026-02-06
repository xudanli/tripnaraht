#!/usr/bin/env node

/**
 * 测试 Google Maps MCP 集成
 * 
 * 验证 Google Maps 客户端和工具是否正常工作
 */

import { getGoogleMapsClient } from '../src/mcp/google-maps-client';

async function testGoogleMapsIntegration() {
  console.log('🧪 开始测试 Google Maps MCP 集成...\n');

  const client = getGoogleMapsClient();

  try {
    // 测试连接
    console.log('1️⃣ 测试连接到 Google Maps MCP 服务器...');
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

    // 测试获取路线
    console.log('3️⃣ 测试获取路线功能...');
    console.log('路线: 从 "New York, NY" 到 "Boston, MA"');
    const routeResult = await client.getRoute({
      origin_address: 'New York, NY',
      destination_address: 'Boston, MA',
      travelMode: 'DRIVE',
      units: 'METRIC',
      languageCode: 'en-US',
    });
    
    if (routeResult.content) {
      const content = JSON.parse(routeResult.content[0].text);
      console.log('路线结果:', JSON.stringify(content, null, 2));
    } else {
      console.log('路线结果:', JSON.stringify(routeResult, null, 2));
    }
    console.log('✅ 获取路线功能正常\n');

    // 测试计算路线矩阵
    console.log('4️⃣ 测试计算路线矩阵功能...');
    console.log('起点: ["New York, NY"], 终点: ["Boston, MA", "Philadelphia, PA"]');
    const matrixResult = await client.computeRouteMatrix({
      origins: ['New York, NY'],
      destinations: ['Boston, MA', 'Philadelphia, PA'],
      travelMode: 'DRIVE',
      units: 'METRIC',
      languageCode: 'en-US',
    });
    
    if (matrixResult.content) {
      const content = JSON.parse(matrixResult.content[0].text);
      console.log('矩阵结果:', JSON.stringify(content, null, 2));
    } else {
      console.log('矩阵结果:', JSON.stringify(matrixResult, null, 2));
    }
    console.log('✅ 计算路线矩阵功能正常\n');

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
    console.log('5️⃣ 断开连接...');
    await client.disconnect();
    console.log('✅ 已断开连接');
  }
}

// 运行测试
testGoogleMapsIntegration().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
