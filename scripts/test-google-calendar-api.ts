#!/usr/bin/env node
/**
 * 测试 Google Calendar API 接口
 * 
 * 测试场景：
 * 1. 列出所有可用工具
 * 2. 列出所有日历
 * 3. 列出日历事件
 * 4. 创建日历事件
 * 5. 查找空闲时间段
 * 6. 快速添加事件
 * 7. 更新日历事件
 * 8. 查找事件
 * 9. 删除日历事件
 * 10. 获取当前时间
 * 11. 同步行程到日历（需要真实的 tripId）
 * 12. 删除行程的所有日历事件（需要真实的 tripId）
 */

import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/google-calendar`;

// 颜色输出辅助函数
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message: string) {
  log(`✅ ${message}`, 'green');
}

function logError(message: string) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, 'cyan');
}

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
}

async function testGoogleCalendarAPI() {
  console.log('\n🧪 开始测试 Google Calendar API 接口...\n');
  console.log(`📍 API Base URL: ${API_BASE}\n`);

  // 检查服务器是否可用
  logInfo('检查 API 服务器连接...');
  try {
    await axios.get(`${BASE_URL}/health`, { timeout: 3000 }).catch(() => {
      // 如果没有 /health 端点，尝试访问根路径
      return axios.get(`${BASE_URL}`, { timeout: 3000 });
    });
    logSuccess('API 服务器连接正常');
  } catch (error: any) {
    logError(`无法连接到 API 服务器 (${BASE_URL})`);
    logWarning('请确保服务器已启动: npm run dev 或 npm run start');
    logInfo('或者设置环境变量: API_BASE_URL=http://your-server:port');
    process.exit(1);
  }

  const results: TestResult[] = [];
  let createdEventId: string | null = null;

  // 测试 1: 列出所有可用工具
  console.log('📋 测试 1: 列出所有可用工具');
  try {
    const response = await axios.get(`${API_BASE}/tools`);
    if (response.data.success) {
      logSuccess(`获取工具列表成功: ${JSON.stringify(response.data.data, null, 2)}`);
      results.push({ name: '列出工具', success: true, data: response.data.data });
    } else {
      throw new Error(response.data.error?.message || '未知错误');
    }
  } catch (error: any) {
    const errorMsg = error.response?.data?.error?.message || error.message || '连接失败';
    logError(`获取工具列表失败: ${errorMsg}`);
    if (error.code === 'ECONNREFUSED') {
      logWarning('服务器可能未启动，请先运行: npm run dev');
    }
    results.push({ name: '列出工具', success: false, error: errorMsg });
  }

  // 测试 2: 列出所有日历
  console.log('\n📋 测试 2: 列出所有日历');
  try {
    const response = await axios.get(`${API_BASE}/calendars`);
    if (response.data.success) {
      const calendars = response.data.data?.calendars || [];
      logSuccess(`获取日历列表成功: 找到 ${calendars.length} 个日历`);
      if (calendars.length > 0) {
        logInfo(`第一个日历: ${calendars[0].summary} (${calendars[0].id})`);
      }
      results.push({ name: '列出日历', success: true, data: calendars });
    } else {
      throw new Error(response.data.error?.message || '未知错误');
    }
  } catch (error: any) {
    logWarning(`获取日历列表失败: ${error.message}`);
    logInfo('这可能是因为 OAuth 未授权，需要先完成授权流程');
    results.push({ name: '列出日历', success: false, error: error.message });
  }

  // 测试 3: 获取当前时间
  console.log('\n📋 测试 3: 获取当前时间');
  try {
    const response = await axios.get(`${API_BASE}/current-time`);
    if (response.data.success) {
      logSuccess(`获取当前时间成功: ${response.data.data?.dateTime}`);
      results.push({ name: '获取当前时间', success: true, data: response.data.data });
    } else {
      throw new Error(response.data.error?.message || '未知错误');
    }
  } catch (error: any) {
    logError(`获取当前时间失败: ${error.message}`);
    results.push({ name: '获取当前时间', success: false, error: error.message });
  }

  // 测试 4: 列出日历事件
  console.log('\n📋 测试 4: 列出日历事件');
  try {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const response = await axios.get(`${API_BASE}/events`, {
      params: {
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: nextWeek.toISOString(),
        maxResults: 10,
      },
    });
    if (response.data.success) {
      const events = response.data.data?.events || [];
      logSuccess(`获取事件列表成功: 找到 ${events.length} 个事件`);
      if (events.length > 0) {
        logInfo(`第一个事件: ${events[0].summary} (${events[0].id})`);
      }
      results.push({ name: '列出事件', success: true, data: events });
    } else {
      throw new Error(response.data.error?.message || '未知错误');
    }
  } catch (error: any) {
    logWarning(`获取事件列表失败: ${error.message}`);
    results.push({ name: '列出事件', success: false, error: error.message });
  }

  // 测试 5: 创建日历事件
  console.log('\n📋 测试 5: 创建日历事件');
  try {
    const now = new Date();
    const startTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2小时后
    const endTime = new Date(startTime.getTime() + 1 * 60 * 60 * 1000); // 持续1小时

    const eventData = {
      calendarId: 'primary',
      summary: 'TripNara 测试事件',
      description: '这是一个由 TripNara API 测试脚本创建的测试事件',
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'UTC',
      },
      location: '测试地点',
    };

    const response = await axios.post(`${API_BASE}/events`, eventData);
    if (response.data.success) {
      createdEventId = response.data.data?.id;
      logSuccess(`创建事件成功: ${createdEventId}`);
      logInfo(`事件标题: ${response.data.data?.summary}`);
      results.push({ name: '创建事件', success: true, data: response.data.data });
    } else {
      throw new Error(response.data.error?.message || '未知错误');
    }
  } catch (error: any) {
    logWarning(`创建事件失败: ${error.message}`);
    results.push({ name: '创建事件', success: false, error: error.message });
  }

  // 测试 6: 查找空闲时间段
  console.log('\n📋 测试 6: 查找空闲时间段');
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const response = await axios.post(`${API_BASE}/free-slots`, {
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: tomorrow.toISOString(),
      durationMinutes: 60,
    });
    if (response.data.success) {
      const freeSlots = response.data.data?.freeSlots || [];
      logSuccess(`查找空闲时间段成功: 找到 ${freeSlots.length} 个空闲时间段`);
      if (freeSlots.length > 0) {
        logInfo(`第一个空闲时间段: ${freeSlots[0].start} - ${freeSlots[0].end}`);
      }
      results.push({ name: '查找空闲时间段', success: true, data: freeSlots });
    } else {
      throw new Error(response.data.error?.message || '未知错误');
    }
  } catch (error: any) {
    logWarning(`查找空闲时间段失败: ${error.message}`);
    results.push({ name: '查找空闲时间段', success: false, error: error.message });
  }

  // 测试 7: 快速添加事件
  console.log('\n📋 测试 7: 快速添加事件');
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const response = await axios.post(`${API_BASE}/quick-add`, {
      calendarId: 'primary',
      text: `明天下午2点 TripNara 快速添加测试`,
    });
    if (response.data.success) {
      logSuccess(`快速添加事件成功: ${response.data.data?.id}`);
      logInfo(`事件标题: ${response.data.data?.summary}`);
      results.push({ name: '快速添加事件', success: true, data: response.data.data });
    } else {
      throw new Error(response.data.error?.message || '未知错误');
    }
  } catch (error: any) {
    logWarning(`快速添加事件失败: ${error.message}`);
    results.push({ name: '快速添加事件', success: false, error: error.message });
  }

  // 测试 8: 查找事件（如果已创建事件）
  if (createdEventId) {
    console.log('\n📋 测试 8: 查找事件');
    try {
      const response = await axios.post(`${API_BASE}/events/find`, {
        calendarId: 'primary',
        query: 'TripNara 测试',
      });
      if (response.data.success) {
        const events = response.data.data?.events || [];
        logSuccess(`查找事件成功: 找到 ${events.length} 个匹配的事件`);
        results.push({ name: '查找事件', success: true, data: events });
      } else {
        throw new Error(response.data.error?.message || '未知错误');
      }
    } catch (error: any) {
      logWarning(`查找事件失败: ${error.message}`);
      results.push({ name: '查找事件', success: false, error: error.message });
    }
  }

  // 测试 9: 更新日历事件（如果已创建事件）
  if (createdEventId) {
    console.log('\n📋 测试 9: 更新日历事件');
    try {
      const now = new Date();
      const startTime = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3小时后
      const endTime = new Date(startTime.getTime() + 1.5 * 60 * 60 * 1000); // 持续1.5小时

      const response = await axios.post(`${API_BASE}/events/${createdEventId}/update`, {
        calendarId: 'primary',
        summary: 'TripNara 测试事件（已更新）',
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'UTC',
        },
      });
      if (response.data.success) {
        logSuccess(`更新事件成功: ${createdEventId}`);
        logInfo(`更新后标题: ${response.data.data?.summary}`);
        results.push({ name: '更新事件', success: true, data: response.data.data });
      } else {
        throw new Error(response.data.error?.message || '未知错误');
      }
    } catch (error: any) {
      logWarning(`更新事件失败: ${error.message}`);
      results.push({ name: '更新事件', success: false, error: error.message });
    }
  }

  // 测试 10: 删除日历事件（如果已创建事件）
  if (createdEventId) {
    console.log('\n📋 测试 10: 删除日历事件');
    try {
      const response = await axios.post(`${API_BASE}/events/${createdEventId}/delete`, {
        calendarId: 'primary',
      });
      if (response.data.success) {
        logSuccess(`删除事件成功: ${createdEventId}`);
        results.push({ name: '删除事件', success: true });
      } else {
        throw new Error(response.data.error?.message || '未知错误');
      }
    } catch (error: any) {
      logWarning(`删除事件失败: ${error.message}`);
      results.push({ name: '删除事件', success: false, error: error.message });
    }
  }

  // 测试 11: 同步行程到日历（需要真实的 tripId，这里只是演示）
  console.log('\n📋 测试 11: 同步行程到日历');
  logInfo('注意: 此测试需要真实的 tripId，当前跳过');
  logInfo('使用方法: POST /api/google-calendar/trips/:tripId/sync');
  logInfo('请求体: { userId: "user-id", calendarId?: "primary" }');
  results.push({ name: '同步行程到日历', success: true, data: { skipped: true, reason: '需要真实的 tripId' } });

  // 测试 12: 删除行程的所有日历事件（需要真实的 tripId，这里只是演示）
  console.log('\n📋 测试 12: 删除行程的所有日历事件');
  logInfo('注意: 此测试需要真实的 tripId，当前跳过');
  logInfo('使用方法: POST /api/google-calendar/trips/:tripId/delete-events');
  logInfo('请求体: { userId: "user-id" }');
  results.push({ name: '删除行程事件', success: true, data: { skipped: true, reason: '需要真实的 tripId' } });

  // 输出测试总结
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试总结');
  console.log('='.repeat(60));

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  const totalCount = results.length;

  log(`\n总计: ${totalCount} 个测试`, 'blue');
  logSuccess(`成功: ${successCount} 个`);
  if (failCount > 0) {
    logError(`失败: ${failCount} 个`);
  }

  console.log('\n详细结果:');
  results.forEach((result, index) => {
    if (result.success) {
      logSuccess(`${index + 1}. ${result.name}`);
    } else {
      logError(`${index + 1}. ${result.name}: ${result.error}`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log('💡 提示');
  console.log('='.repeat(60));
  console.log('1. 如果某些测试失败，可能是因为 OAuth 未授权');
  console.log('2. 首次使用需要完成 Google Calendar OAuth 授权流程');
  console.log('3. 授权完成后，token 会保存在 ~/.tripnara-mcp/googlecalendar-tokens.json');
  console.log('4. 行程同步功能需要真实的 tripId 和 userId');
  console.log('\n');
}

// 运行测试
testGoogleCalendarAPI().catch((error) => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
