#!/usr/bin/env npx tsx
/**
 * 测试自然语言创建行程接口（包含 Context Package 自动构建）
 * 
 * 测试内容：
 * 1. 自然语言创建行程（自动检测目的地并构建 Context Package）
 * 2. 对话上下文管理
 * 3. Context Package 是否正确构建和传递
 */

import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

// 颜色输出
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

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
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
  log(`ℹ️  ${message}`, 'blue');
}

// 测试用户 ID（用于测试）
const TEST_USER_ID = 'test-user-123';

/**
 * 测试 1: 自然语言创建行程（首次请求，自动构建 Context Package）
 */
async function testCreateTripFromNL() {
  logSection('测试 1: 自然语言创建行程（自动构建 Context Package）');

  try {
    const response = await axios.post(
      `${API_BASE}/trips/from-natural-language`,
      {
        text: '帮我规划去冰岛的10天行程，预算3万，带娃',
        // sessionId 不提供，系统会自动创建新会话
      },
      {
        headers: {
          'Content-Type': 'application/json',
          // 注意：实际使用时需要真实的认证 token
          // 'Authorization': `Bearer ${token}`,
        },
        // 设置较长的超时时间，因为需要构建 Context Package
        timeout: 30000,
      }
    );

    if (response.data.success) {
      logSuccess('请求成功');
      logInfo(`会话 ID: ${response.data.data.sessionId}`);
      
      if (response.data.data.needsClarification) {
        logWarning('需要澄清信息');
        logInfo(`规划师回复: ${response.data.data.plannerReply?.substring(0, 200)}...`);
        logInfo(`建议问题: ${JSON.stringify(response.data.data.suggestedQuestions)}`);
        return response.data.data.sessionId;
      } else {
        logSuccess('行程创建成功');
        logInfo(`行程 ID: ${response.data.data.trip?.id}`);
        logInfo(`目的地: ${response.data.data.parsedParams?.destination}`);
        logInfo(`日期: ${response.data.data.parsedParams?.startDate} 至 ${response.data.data.parsedParams?.endDate}`);
        logInfo(`预算: ${response.data.data.parsedParams?.totalBudget}元`);
        return response.data.data.sessionId;
      }
    } else {
      logError(`请求失败: ${response.data.error?.message || 'Unknown error'}`);
      return null;
    }
  } catch (error: any) {
    if (error.response) {
      logError(`HTTP ${error.response.status}: ${error.response.data?.error?.message || error.message}`);
      logInfo(`响应数据: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.request) {
      logError('请求失败：服务器无响应');
      logWarning('请确保服务器正在运行: npm run dev');
    } else {
      logError(`请求错误: ${error.message}`);
    }
    return null;
  }
}

/**
 * 测试 2: 继续对话（使用已有会话）
 */
async function testContinueConversation(sessionId: string) {
  logSection('测试 2: 继续对话（使用已有会话）');

  try {
    const response = await axios.post(
      `${API_BASE}/trips/from-natural-language`,
      {
        text: '预算包含机票',
        sessionId: sessionId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    if (response.data.success) {
      logSuccess('请求成功');
      logInfo(`会话 ID: ${response.data.data.sessionId}`);
      
      if (response.data.data.needsClarification) {
        logWarning('需要澄清信息');
        logInfo(`规划师回复: ${response.data.data.plannerReply?.substring(0, 200)}...`);
      } else {
        logSuccess('行程创建成功');
        logInfo(`行程 ID: ${response.data.data.trip?.id}`);
      }
      return response.data.data.sessionId;
    } else {
      logError(`请求失败: ${response.data.error?.message || 'Unknown error'}`);
      return null;
    }
  } catch (error: any) {
    if (error.response) {
      logError(`HTTP ${error.response.status}: ${error.response.data?.error?.message || error.message}`);
    } else {
      logError(`请求错误: ${error.message}`);
    }
    return null;
  }
}

/**
 * 测试 3: 获取对话上下文
 */
async function testGetConversationContext(sessionId: string) {
  logSection('测试 3: 获取对话上下文');

  try {
    const response = await axios.get(
      `${API_BASE}/trips/nl-conversation/${sessionId}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.success) {
      logSuccess('获取对话上下文成功');
      const context = response.data.data;
      logInfo(`会话 ID: ${context.sessionId}`);
      logInfo(`用户 ID: ${context.userId}`);
      logInfo(`消息数量: ${context.messages?.length || 0}`);
      logInfo(`创建时间: ${context.createdAt}`);
      logInfo(`更新时间: ${context.updatedAt}`);
      
      if (context.messages && context.messages.length > 0) {
        logInfo('\n对话历史:');
        context.messages.forEach((msg: any, index: number) => {
          const role = msg.role === 'user' ? '👤 用户' : '🤖 助手';
          const content = msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '');
          logInfo(`${index + 1}. ${role}: ${content}`);
        });
      }
      
      if (context.partialParams) {
        logInfo('\n部分解析参数:');
        logInfo(JSON.stringify(context.partialParams, null, 2));
      }
      
      return true;
    } else {
      logError(`获取失败: ${response.data.error?.message || 'Unknown error'}`);
      return false;
    }
  } catch (error: any) {
    if (error.response) {
      logError(`HTTP ${error.response.status}: ${error.response.data?.error?.message || error.message}`);
    } else {
      logError(`请求错误: ${error.message}`);
    }
    return false;
  }
}

/**
 * 测试 4: 获取用户的所有会话
 */
async function testGetUserSessions() {
  logSection('测试 4: 获取用户的所有会话');

  try {
    const response = await axios.get(
      `${API_BASE}/trips/nl-conversation`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.success) {
      logSuccess('获取会话列表成功');
      const sessions = response.data.data || [];
      logInfo(`会话数量: ${sessions.length}`);
      
      sessions.forEach((session: any, index: number) => {
        logInfo(`\n会话 ${index + 1}:`);
        logInfo(`  ID: ${session.sessionId}`);
        logInfo(`  消息数量: ${session.messages?.length || 0}`);
        logInfo(`  创建时间: ${session.createdAt}`);
      });
      
      return true;
    } else {
      logError(`获取失败: ${response.data.error?.message || 'Unknown error'}`);
      return false;
    }
  } catch (error: any) {
    if (error.response) {
      logError(`HTTP ${error.response.status}: ${error.response.data?.error?.message || error.message}`);
    } else {
      logError(`请求错误: ${error.message}`);
    }
    return false;
  }
}

/**
 * 测试 5: 更新对话上下文
 */
async function testUpdateConversationContext(sessionId: string) {
  logSection('测试 5: 更新对话上下文');

  try {
    const response = await axios.put(
      `${API_BASE}/trips/nl-conversation/${sessionId}`,
      {
        conversationContext: {
          destination: 'IS',
          preferences: {
            style: 'adventure',
            intensity: 'high',
          },
        },
        partialParams: {
          destination: 'IS',
          startDate: '2026-07-01',
          endDate: '2026-07-10',
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.success) {
      logSuccess('更新对话上下文成功');
      return true;
    } else {
      logError(`更新失败: ${response.data.error?.message || 'Unknown error'}`);
      return false;
    }
  } catch (error: any) {
    if (error.response) {
      logError(`HTTP ${error.response.status}: ${error.response.data?.error?.message || error.message}`);
    } else {
      logError(`请求错误: ${error.message}`);
    }
    return false;
  }
}

/**
 * 测试 6: 删除会话
 */
async function testDeleteConversation(sessionId: string) {
  logSection('测试 6: 删除会话');

  try {
    const response = await axios.delete(
      `${API_BASE}/trips/nl-conversation/${sessionId}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.success) {
      logSuccess('删除会话成功');
      return true;
    } else {
      logError(`删除失败: ${response.data.error?.message || 'Unknown error'}`);
      return false;
    }
  } catch (error: any) {
    if (error.response) {
      logError(`HTTP ${error.response.status}: ${error.response.data?.error?.message || error.message}`);
    } else {
      logError(`请求错误: ${error.message}`);
    }
    return false;
  }
}

/**
 * 主测试函数
 */
async function main() {
  logSection('自然语言创建行程接口测试（包含 Context Package 自动构建）');
  logInfo(`API 地址: ${API_BASE}`);
  logInfo(`测试用户 ID: ${TEST_USER_ID}`);
  logWarning('注意：此测试需要服务器正在运行 (npm run dev)');
  logWarning('注意：Context Package 自动构建需要 ContextEngineerService 和 SkillsRegistryService 可用\n');

  // 测试 1: 创建行程（自动构建 Context Package）
  const sessionId = await testCreateTripFromNL();
  
  if (!sessionId) {
    logError('测试失败：无法创建会话');
    process.exit(1);
  }

  // 等待一下，确保 Context Package 构建完成
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 测试 2: 获取对话上下文
  await testGetConversationContext(sessionId);

  // 测试 3: 获取用户的所有会话
  await testGetUserSessions();

  // 测试 4: 更新对话上下文
  await testUpdateConversationContext(sessionId);

  // 测试 5: 继续对话
  await testContinueConversation(sessionId);

  // 测试 6: 删除会话（可选，注释掉以保留测试数据）
  // await testDeleteConversation(sessionId);

  logSection('测试完成');
  logSuccess('所有测试已完成！');
  logInfo(`测试会话 ID: ${sessionId}`);
  logWarning('如需查看详细日志，请检查服务器控制台输出');
}

// 运行测试
main().catch((error) => {
  logError(`测试执行失败: ${error.message}`);
  console.error(error);
  process.exit(1);
});
