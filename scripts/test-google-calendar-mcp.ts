#!/usr/bin/env node

/**
 * Google Calendar MCP 测试脚本
 * 
 * 测试 Google Calendar MCP 客户端的连接和基本功能
 */

import { GoogleCalendarMcpClient } from '../src/mcp/google-calendar-client';

async function testGoogleCalendarMcp() {
  const client = new GoogleCalendarMcpClient();

  try {
    console.log('🔌 正在连接到 Google Calendar MCP 服务器...\n');
    await client.connect();

    console.log('✅ 连接成功！\n');

    // 测试 1: 获取当前日期时间
    console.log('📅 测试 1: 获取当前日期时间');
    try {
      const now = await client.getCurrentDateTime();
      console.log('结果:', JSON.stringify(now, null, 2));
      console.log('✅ 测试 1 通过\n');
    } catch (error) {
      console.error('❌ 测试 1 失败:', error);
    }

    // 测试 2: 列出所有日历
    console.log('📋 测试 2: 列出所有日历');
    try {
      const calendars = await client.listCalendars();
      console.log('结果:', JSON.stringify(calendars, null, 2));
      console.log('✅ 测试 2 通过\n');
    } catch (error) {
      console.error('❌ 测试 2 失败:', error);
    }

    // 测试 3: 列出事件（最近 5 个）
    console.log('📅 测试 3: 列出最近的事件');
    try {
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7天后

      const events = await client.listEvents({
        timeMin,
        timeMax,
        maxResults: 5,
      });
      console.log('结果:', JSON.stringify(events, null, 2));
      console.log('✅ 测试 3 通过\n');
    } catch (error) {
      console.error('❌ 测试 3 失败:', error);
    }

    // 测试 4: 列出所有可用工具
    console.log('🛠️  测试 4: 列出所有可用工具');
    try {
      const tools = await client.listTools();
      console.log(`找到 ${tools.tools?.length || 0} 个工具:`);
      if (tools.tools) {
        tools.tools.forEach((tool: any) => {
          console.log(`  - ${tool.name}: ${tool.description || '无描述'}`);
        });
      }
      console.log('✅ 测试 4 通过\n');
    } catch (error) {
      console.error('❌ 测试 4 失败:', error);
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
testGoogleCalendarMcp().catch((error) => {
  console.error('❌ 未捕获的错误:', error);
  process.exit(1);
});
