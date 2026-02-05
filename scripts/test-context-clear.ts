#!/usr/bin/env tsx
/**
 * 测试会话上下文清空功能
 * 
 * 测试场景：
 * 1. 创建新对话（不传递 sessionId）- 应该自动清空旧会话
 * 2. 继续对话（传递存在的 sessionId）- 应该保留历史
 * 3. 传递不存在的 sessionId - 应该自动清空并创建新会话
 * 4. 显式传递 isNewConversation: true - 应该强制清空
 */

import * as dotenv from 'dotenv';
import * as http from 'http';
import * as https from 'https';
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
const TEST_USER_ID = 'test-user-' + Date.now();
const TEST_TOKEN = process.env.TEST_TOKEN || ''; // 如果有认证token，在这里设置
const ALLOW_TEST_MODE = process.env.ALLOW_TEST_MODE === 'true';

interface TestResult {
  scenario: string;
  success: boolean;
  message: string;
  sessionId?: string;
  messageCount?: number;
}

function httpRequest(url: string, options: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode || 200, data: jsonData });
        } catch (e) {
          resolve({ status: res.statusCode || 200, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function testApi(
  endpoint: string,
  body: any,
  description: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log(`\n📤 [${description}]`);
    console.log(`   请求: POST ${endpoint}`);
    console.log(`   参数: ${JSON.stringify(body, null, 2)}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (TEST_TOKEN) {
      headers['Authorization'] = `Bearer ${TEST_TOKEN}`;
    }

    const { status, data: result } = await httpRequest(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body,
    });
    
    if (status >= 400) {
      console.log(`   ❌ 错误: ${status}`);
      console.log(`   响应: ${JSON.stringify(result, null, 2)}`);
      return { success: false, error: result.message || result.error?.message || '请求失败' };
    }

    console.log(`   ✅ 成功: ${status}`);
    console.log(`   响应: ${JSON.stringify(result, null, 2)}`);
    return { success: true, data: result.data || result };
  } catch (error: any) {
    const errorMsg = error.message || error.toString() || '未知错误';
    console.log(`   ❌ 异常: ${errorMsg}`);
    if (error.code) {
      console.log(`   错误代码: ${error.code}`);
    }
    if (error.code === 'ECONNREFUSED') {
      console.log(`   💡 提示: 服务器连接被拒绝，请确认服务器是否在运行`);
    }
    return { success: false, error: errorMsg };
  }
}

async function getConversationContext(sessionId: string): Promise<any> {
  try {
    const headers: Record<string, string> = {};
    if (TEST_TOKEN) {
      headers['Authorization'] = `Bearer ${TEST_TOKEN}`;
    }

    const { status, data: result } = await httpRequest(`${API_BASE_URL}/trips/nl-conversation/${sessionId}`, {
      method: 'GET',
      headers,
    });

    if (status >= 400) {
      return null;
    }

    return result.data || null;
  } catch (error) {
    return null;
  }
}

async function runTests(): Promise<void> {
  console.log('🧪 开始测试会话上下文清空功能\n');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Test User ID: ${TEST_USER_ID}`);
  console.log('='.repeat(60));

  const results: TestResult[] = [];
  let firstSessionId: string | undefined;
  let secondSessionId: string | undefined;

  // ============================================
  // 测试场景1：创建新对话（不传递 sessionId）
  // ============================================
  console.log('\n📋 测试场景1：创建新对话（不传递 sessionId）');
  console.log('预期：自动清空旧会话，创建新会话');

  const result1 = await testApi(
    '/trips/from-natural-language',
    {
      text: '想去冰岛看极光，预算5万',
    },
    '场景1：创建新对话'
  );

  if (result1.success && result1.data?.sessionId) {
    firstSessionId = result1.data.sessionId;
    const context1 = await getConversationContext(firstSessionId);
    const messageCount1 = context1?.messages?.length || 0;
    
    results.push({
      scenario: '场景1：创建新对话（不传递 sessionId）',
      success: true,
      message: `成功创建新会话，sessionId: ${firstSessionId}, 消息数: ${messageCount1}`,
      sessionId: firstSessionId,
      messageCount: messageCount1,
    });
  } else {
    results.push({
      scenario: '场景1：创建新对话（不传递 sessionId）',
      success: false,
      message: result1.error || '创建失败',
    });
  }

  // 等待一下，确保数据保存
  await new Promise(resolve => setTimeout(resolve, 1000));

  // ============================================
  // 测试场景2：继续对话（传递存在的 sessionId）
  // ============================================
  if (firstSessionId) {
    console.log('\n📋 测试场景2：继续对话（传递存在的 sessionId）');
    console.log('预期：继续使用现有会话，保留历史消息');

    const result2 = await testApi(
      '/trips/from-natural-language',
      {
        text: '预算可以增加到6万',
        sessionId: firstSessionId,
      },
      '场景2：继续对话'
    );

    if (result2.success) {
      const context2 = await getConversationContext(firstSessionId);
      const messageCount2 = context2?.messages?.length || 0;
      
      results.push({
        scenario: '场景2：继续对话（传递存在的 sessionId）',
        success: messageCount2 > 1,
        message: `继续对话成功，sessionId: ${firstSessionId}, 消息数: ${messageCount2} (应该 > 1)`,
        sessionId: firstSessionId,
        messageCount: messageCount2,
      });
    } else {
      results.push({
        scenario: '场景2：继续对话（传递存在的 sessionId）',
        success: false,
        message: result2.error || '继续对话失败',
      });
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // ============================================
  // 测试场景3：创建第二个对话（不传递 sessionId）
  // ============================================
  console.log('\n📋 测试场景3：创建第二个对话（不传递 sessionId）');
  console.log('预期：自动清空第一个会话，创建新会话');

  const result3 = await testApi(
    '/trips/from-natural-language',
    {
      text: '想去日本看樱花，预算3万',
    },
    '场景3：创建第二个对话'
  );

  if (result3.success && result3.data?.sessionId) {
    secondSessionId = result3.data.sessionId;
    const context3 = await getConversationContext(secondSessionId);
    const messageCount3 = context3?.messages?.length || 0;
    
    // 检查第一个会话是否还存在
    const context1After = await getConversationContext(firstSessionId!);
    const firstSessionExists = context1After !== null;
    
    results.push({
      scenario: '场景3：创建第二个对话（不传递 sessionId）',
      success: !firstSessionExists && messageCount3 === 1,
      message: `创建第二个对话成功，新sessionId: ${secondSessionId}, 消息数: ${messageCount3}, 第一个会话已清空: ${!firstSessionExists}`,
      sessionId: secondSessionId,
      messageCount: messageCount3,
    });
  } else {
    results.push({
      scenario: '场景3：创建第二个对话（不传递 sessionId）',
      success: false,
      message: result3.error || '创建第二个对话失败',
    });
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  // ============================================
  // 测试场景4：传递不存在的 sessionId
  // ============================================
  console.log('\n📋 测试场景4：传递不存在的 sessionId');
  console.log('预期：自动清空旧会话，创建新会话');

  const result4 = await testApi(
    '/trips/from-natural-language',
    {
      text: '想去法国看埃菲尔铁塔，预算4万',
      sessionId: 'nl_nonexistent_session_12345',
    },
    '场景4：传递不存在的 sessionId'
  );

  if (result4.success && result4.data?.sessionId) {
    const newSessionId = result4.data.sessionId;
    const context4 = await getConversationContext(newSessionId);
    const messageCount4 = context4?.messages?.length || 0;
    
    results.push({
      scenario: '场景4：传递不存在的 sessionId',
      success: newSessionId !== 'nl_nonexistent_session_12345' && messageCount4 === 1,
      message: `自动创建新会话成功，新sessionId: ${newSessionId}, 消息数: ${messageCount4}`,
      sessionId: newSessionId,
      messageCount: messageCount4,
    });
  } else {
    results.push({
      scenario: '场景4：传递不存在的 sessionId',
      success: false,
      message: result4.error || '处理失败',
    });
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  // ============================================
  // 测试场景5：显式传递 isNewConversation: true
  // ============================================
  if (secondSessionId) {
    console.log('\n📋 测试场景5：显式传递 isNewConversation: true');
    console.log('预期：强制清空旧会话，创建新会话');

    const result5 = await testApi(
      '/trips/from-natural-language',
      {
        text: '想去意大利看罗马，预算5万',
        sessionId: secondSessionId,
        isNewConversation: true,
      },
      '场景5：显式传递 isNewConversation: true'
    );

    if (result5.success && result5.data?.sessionId) {
      const newSessionId5 = result5.data.sessionId;
      const context5 = await getConversationContext(newSessionId5);
      const messageCount5 = context5?.messages?.length || 0;
      
      // 检查旧会话是否还存在
      const context2After = await getConversationContext(secondSessionId);
      const secondSessionExists = context2After !== null;
      
      results.push({
        scenario: '场景5：显式传递 isNewConversation: true',
        success: newSessionId5 !== secondSessionId && messageCount5 === 1 && !secondSessionExists,
        message: `强制清空成功，新sessionId: ${newSessionId5}, 消息数: ${messageCount5}, 旧会话已清空: ${!secondSessionExists}`,
        sessionId: newSessionId5,
        messageCount: messageCount5,
      });
    } else {
      results.push({
        scenario: '场景5：显式传递 isNewConversation: true',
        success: false,
        message: result5.error || '处理失败',
      });
    }
  }

  // ============================================
  // 测试结果汇总
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果汇总\n');

  let successCount = 0;
  let failCount = 0;

  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.scenario}`);
    console.log(`   ${result.message}`);
    if (result.sessionId) {
      console.log(`   SessionId: ${result.sessionId}`);
    }
    if (result.messageCount !== undefined) {
      console.log(`   消息数: ${result.messageCount}`);
    }
    console.log('');

    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
  });

  console.log('='.repeat(60));
  console.log(`总计: ${results.length} 个测试场景`);
  console.log(`成功: ${successCount} 个`);
  console.log(`失败: ${failCount} 个`);
  console.log(`成功率: ${((successCount / results.length) * 100).toFixed(1)}%`);

  if (failCount > 0) {
    console.log('\n⚠️  部分测试失败，请检查日志');
    process.exit(1);
  } else {
    console.log('\n✅ 所有测试通过！');
    process.exit(0);
  }
}

// 运行测试
runTests().catch((error) => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});
