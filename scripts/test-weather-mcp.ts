#!/usr/bin/env node

/**
 * 测试 Weather MCP 集成
 * 
 * 验证 Weather 客户端和工具是否正常工作
 */

import { getWeatherClient } from '../src/mcp/weather-client';

async function testWeatherIntegration() {
  console.log('🧪 开始测试 Weather MCP 集成...\n');

  const client = getWeatherClient();

  try {
    // 测试连接
    console.log('1️⃣ 测试连接到 Weather MCP 服务器...');
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

    // 测试获取当前天气
    console.log('3️⃣ 测试获取当前天气...');
    console.log('城市: New York');
    const currentWeather = await client.getCurrentWeather({
      city: 'New York',
    });
    
    if (currentWeather.content) {
      const content = JSON.parse(currentWeather.content[0].text);
      console.log('当前天气:', JSON.stringify(content, null, 2));
    } else {
      console.log('天气结果:', JSON.stringify(currentWeather, null, 2));
    }
    console.log('✅ 获取当前天气功能正常\n');

    // 测试获取日期范围内的天气
    console.log('4️⃣ 测试获取日期范围内的天气...');
    console.log('城市: Tokyo, 日期范围: 2026-02-07 到 2026-02-10');
    const rangeWeather = await client.getWeatherByDatetimeRange({
      city: 'Tokyo',
      start_date: '2026-02-07',
      end_date: '2026-02-10',
    });
    
    if (rangeWeather.content) {
      const content = JSON.parse(rangeWeather.content[0].text);
      console.log('日期范围天气:', JSON.stringify(content, null, 2));
    } else {
      console.log('天气结果:', JSON.stringify(rangeWeather, null, 2));
    }
    console.log('✅ 获取日期范围天气功能正常\n');

    // 测试获取当前日期时间
    console.log('5️⃣ 测试获取当前日期时间...');
    console.log('时区: Asia/Shanghai');
    const currentDateTime = await client.getCurrentDateTime({
      timezone: 'Asia/Shanghai',
    });
    
    if (currentDateTime.content) {
      const content = JSON.parse(currentDateTime.content[0].text);
      console.log('当前日期时间:', JSON.stringify(content, null, 2));
    } else {
      console.log('日期时间结果:', JSON.stringify(currentDateTime, null, 2));
    }
    console.log('✅ 获取当前日期时间功能正常\n');

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
    console.log('6️⃣ 断开连接...');
    await client.disconnect();
    console.log('✅ 已断开连接');
  }
}

// 运行测试
testWeatherIntegration().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
