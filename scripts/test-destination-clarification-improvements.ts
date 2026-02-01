// scripts/test-destination-clarification-improvements.ts
// 测试目的地特化澄清系统的改进功能（Critical 字段、Gate 替代方案、会话 TTL）

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_PREFIX = process.env.API_PREFIX || '/api';
const USER_TOKEN = process.env.USER_TOKEN || 'test-token';
const TEST_USER_ID = process.env.TEST_USER_ID || 'test-user-123';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// 颜色输出
const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
};

function logSection(title: string) {
  console.log('\n' + colors.blue('='.repeat(60)));
  console.log(colors.blue(title));
  console.log(colors.blue('='.repeat(60)));
}

function logTest(name: string) {
  console.log(colors.cyan(`\n🧪 ${name}`));
}

function logSuccess(message: string) {
  console.log(colors.green(`✅ ${message}`));
}

function logError(message: string) {
  console.log(colors.red(`❌ ${message}`));
}

function logWarning(message: string) {
  console.log(colors.yellow(`⚠️  ${message}`));
}

function logInfo(message: string) {
  console.log(`ℹ️  ${message}`);
}

async function apiCall(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  data?: any,
  headers: Record<string, string> = {}
): Promise<ApiResponse> {
  try {
    const config: any = {
      method,
      url: `${BASE_URL}${API_PREFIX}${url}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: 30000,
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error: any) {
    if (error.response) {
      return {
        success: false,
        error: {
          code: `HTTP_${error.response.status}`,
          message: error.response.data?.error?.message || error.message,
          details: error.response.data,
        },
      };
    }
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error.message,
      },
    };
  }
}

/**
 * 测试 1: Critical 字段阻止创建逻辑
 */
async function testCriticalFieldsBlocking() {
  logSection('测试 1: Critical 字段阻止创建逻辑');

  logTest('步骤 1.1: 创建新会话，提供基础信息（不包含 Critical 字段）');
  const step1 = await apiCall(
    'POST',
    '/trips/from-natural-language',
    {
      text: '我想去格陵兰，7月份，预算5万',
    },
    { Authorization: `Bearer ${USER_TOKEN}` }
  );

  if (!step1.success) {
    logError(`请求失败: ${step1.error?.message}`);
    return;
  }

  const sessionId1 = step1.data?.sessionId;
  if (!sessionId1) {
    logError('未返回 sessionId');
    return;
  }
  logSuccess(`Session ID: ${sessionId1}`);

  if (step1.data?.needsClarification) {
    logSuccess('需要澄清（预期）');
    const questionsCount = step1.data.clarificationQuestions?.length || 0;
    logInfo(`返回 ${questionsCount} 个澄清问题`);
  }

  logTest('步骤 1.2: 回答部分问题（但不回答 Critical 字段）');
  const step2 = await apiCall(
    'POST',
    '/trips/from-natural-language',
    {
      text: '我的活动类型：冰川徒步',
      sessionId: sessionId1,
    },
    { Authorization: `Bearer ${USER_TOKEN}` }
  );

  if (!step2.success) {
    logError(`请求失败: ${step2.error?.message}`);
    return;
  }

  logTest('步骤 1.3: 尝试创建行程（应该被 Critical 字段阻止）');
  // 模拟所有轮次完成，但 Critical 字段缺失的情况
  // 这里我们需要通过回答所有非 Critical 问题来触发创建流程
  const step3 = await apiCall(
    'POST',
    '/trips/from-natural-language',
    {
      text: '我已经回答了所有问题，请创建行程',
      sessionId: sessionId1,
    },
    { Authorization: `Bearer ${USER_TOKEN}` }
  );

  if (!step3.success) {
    logError(`请求失败: ${step3.error?.message}`);
    return;
  }

  if (step3.data?.blockedByCriticalFields) {
    logSuccess('✅ Critical 字段阻止创建（符合预期）');
    logInfo(`阻止原因: ${step3.data.plannerResponseBlocks?.[0]?.highlightText || 'N/A'}`);
    
    if (step3.data.criticalFieldsProgress) {
      const progress = step3.data.criticalFieldsProgress;
      logInfo(`进度: ${progress.completed}/${progress.total} (${progress.percent}%)`);
    }
    
    if (step3.data.clarificationQuestions?.length > 0) {
      logInfo(`返回 ${step3.data.clarificationQuestions.length} 个 Critical 问题`);
    }
  } else if (step3.data?.trip) {
    logWarning('行程已创建（可能 Critical 字段检查未生效）');
  } else {
    logInfo('继续澄清流程（可能还有其他问题需要回答）');
  }
}

/**
 * 测试 2: Gate 替代方案选择
 */
async function testGateAlternativeSelection() {
  logSection('测试 2: Gate 替代方案选择');

  logTest('步骤 2.1: 创建会话，触发 Gate 预检查');
  const step1 = await apiCall(
    'POST',
    '/trips/from-natural-language',
    {
      text: '我想去格陵兰，7月份，预算5万，我想进行东格陵兰远征，但我没有极地经验',
    },
    { Authorization: `Bearer ${USER_TOKEN}` }
  );

  if (!step1.success) {
    logError(`请求失败: ${step1.error?.message}`);
    return;
  }

  const sessionId1 = step1.data?.sessionId;
  if (!sessionId1) {
    logError('未返回 sessionId');
    return;
  }
  logSuccess(`Session ID: ${sessionId1}`);

  // 检查是否被 Gate 阻止
  if (step1.data?.blockedByGate) {
    logSuccess('✅ Gate 预检查触发（符合预期）');
    logInfo(`Gate Check ID: ${step1.data.gateCheckId}`);
    logInfo(`警告消息: ${step1.data.plannerResponseBlocks?.[0]?.highlightText || 'N/A'}`);
    
    const alternativeActions = step1.data.alternativeActions || [];
    if (alternativeActions.length > 0) {
      logSuccess(`返回 ${alternativeActions.length} 个替代方案`);
      alternativeActions.forEach((alt: any, index: number) => {
        logInfo(`  替代方案 ${index + 1}: ${alt.label} - ${alt.description}`);
        logInfo(`    Action: ${alt.action}`);
      });

      logTest('步骤 2.2: 选择第一个替代方案');
      const step2 = await apiCall(
        'POST',
        '/trips/gate-alternative/select',
        {
          sessionId: sessionId1,
          gateCheckId: step1.data.gateCheckId,
          alternativeId: alternativeActions[0].id,
          action: alternativeActions[0].action,
          userInput: '好的，我选择中等风险活动',
        },
        { Authorization: `Bearer ${USER_TOKEN}` }
      );

      if (!step2.success) {
        logError(`选择替代方案失败: ${step2.error?.message}`);
        return;
      }

      logSuccess('✅ 替代方案选择成功');
      if (step2.data?.needsClarification) {
        logInfo('继续澄清流程');
      } else if (step2.data?.trip) {
        logSuccess('行程创建成功');
      }
    } else {
      logWarning('未返回替代方案');
    }
  } else {
    logWarning('Gate 预检查未触发（可能需要更多参数）');
  }
}

/**
 * 测试 3: 会话 TTL 刷新
 */
async function testSessionTTLRefresh() {
  logSection('测试 3: 会话 TTL 刷新');

  logTest('步骤 3.1: 创建新会话');
  const step1 = await apiCall(
    'POST',
    '/trips/from-natural-language',
    {
      text: '我想去格陵兰，7月份，预算5万',
    },
    { Authorization: `Bearer ${USER_TOKEN}` }
  );

  if (!step1.success) {
    logError(`请求失败: ${step1.error?.message}`);
    return;
  }

  const sessionId1 = step1.data?.sessionId;
  if (!sessionId1) {
    logError('未返回 sessionId');
    return;
  }
  logSuccess(`Session ID: ${sessionId1}`);

  logTest('步骤 3.2: 获取会话上下文（检查 expiresAt）');
  const step2 = await apiCall(
    'GET',
    `/trips/nl-conversation/${sessionId1}`,
    undefined,
    { Authorization: `Bearer ${USER_TOKEN}` }
  );

  if (!step2.success) {
    logError(`获取会话上下文失败: ${step2.error?.message}`);
    return;
  }

  const expiresAt1 = step2.data?.expiresAt;
  if (expiresAt1) {
    const expiresDate1 = new Date(expiresAt1);
    const now = new Date();
    const ttlHours = (expiresDate1.getTime() - now.getTime()) / (1000 * 60 * 60);
    logSuccess(`初始过期时间: ${expiresAt1}`);
    logInfo(`TTL: ${ttlHours.toFixed(2)} 小时（预期约 24 小时）`);
  }

  logTest('步骤 3.3: 发送新消息（应该刷新 TTL）');
  await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒，确保时间差异明显

  const step3 = await apiCall(
    'POST',
    '/trips/from-natural-language',
    {
      text: '我的极地经验：有1-2次北极/高山经验',
      sessionId: sessionId1,
    },
    { Authorization: `Bearer ${USER_TOKEN}` }
  );

  if (!step3.success) {
    logError(`请求失败: ${step3.error?.message}`);
    return;
  }

  logTest('步骤 3.4: 再次获取会话上下文（检查 expiresAt 是否更新）');
  const step4 = await apiCall(
    'GET',
    `/trips/nl-conversation/${sessionId1}`,
    undefined,
    { Authorization: `Bearer ${USER_TOKEN}` }
  );

  if (!step4.success) {
    logError(`获取会话上下文失败: ${step4.error?.message}`);
    return;
  }

  const expiresAt2 = step4.data?.expiresAt;
  if (expiresAt2) {
    const expiresDate2 = new Date(expiresAt2);
    const now = new Date();
    const ttlHours2 = (expiresDate2.getTime() - now.getTime()) / (1000 * 60 * 60);
    logSuccess(`更新后过期时间: ${expiresAt2}`);
    logInfo(`TTL: ${ttlHours2.toFixed(2)} 小时（预期约 24 小时）`);

    if (expiresAt1 && expiresAt2) {
      const expiresDate1 = new Date(expiresAt1);
      const expiresDate2 = new Date(expiresAt2);
      if (expiresDate2 > expiresDate1) {
        logSuccess('✅ TTL 已刷新（过期时间已更新）');
      } else {
        logWarning('⚠️  TTL 未刷新（过期时间未更新）');
      }
    }
  }
}

/**
 * 测试 4: 完整流程测试（Critical 字段 -> Gate -> 创建）
 */
async function testCompleteFlow() {
  logSection('测试 4: 完整流程测试');

  logTest('步骤 4.1: 创建会话，提供基础信息');
  const step1 = await apiCall(
    'POST',
    '/trips/from-natural-language',
    {
      text: '我想去格陵兰，7月份，预算5万',
    },
    { Authorization: `Bearer ${USER_TOKEN}` }
  );

  if (!step1.success || !step1.data?.sessionId) {
    logError('创建会话失败');
    return;
  }

  const sessionId = step1.data.sessionId;
  logSuccess(`Session ID: ${sessionId}`);

  logTest('步骤 4.2: 回答 Critical 字段');
  const step2 = await apiCall(
    'POST',
    '/trips/from-natural-language',
    {
      text: '我的极地经验：有1-2次北极/高山经验，风险承受度：接受高风险，活动类型：冰川徒步',
      sessionId,
    },
    { Authorization: `Bearer ${USER_TOKEN}` }
  );

  if (!step2.success) {
    logError(`回答 Critical 字段失败: ${step2.error?.message}`);
    return;
  }

  logTest('步骤 4.3: 回答更多 Critical 字段');
  const step3 = await apiCall(
    'POST',
    '/trips/from-natural-language',
    {
      text: '住宿偏好：酒店，我有极地装备，我理解风险，我有保险，我同意继续',
      sessionId,
    },
    { Authorization: `Bearer ${USER_TOKEN}` }
  );

  if (!step3.success) {
    logError(`继续回答失败: ${step3.error?.message}`);
    return;
  }

  if (step3.data?.trip) {
    logSuccess('✅ 行程创建成功（所有 Critical 字段已回答）');
    logInfo(`行程 ID: ${step3.data.trip.id}`);
  } else if (step3.data?.needsClarification) {
    logInfo('继续澄清流程');
  } else if (step3.data?.blockedByCriticalFields) {
    logWarning('仍被 Critical 字段阻止');
  }
}

async function main() {
  console.log('\n' + colors.blue('='.repeat(60)));
  console.log(colors.blue('目的地特化澄清系统改进功能测试'));
  console.log(colors.blue('='.repeat(60)));
  console.log(`\nBase URL: ${BASE_URL}${API_PREFIX}`);
  console.log(`User Token: ${USER_TOKEN ? '已设置' : '未设置'}\n`);

  // 检查服务是否运行
  try {
    await axios.get(`${BASE_URL}/health`).catch(() => axios.get(`${BASE_URL}`));
    logSuccess('服务运行中\n');
  } catch (error) {
    logError('服务未运行，请先启动服务: npm run start:dev');
    process.exit(1);
  }

  try {
    // 测试 1: Critical 字段阻止创建逻辑
    await testCriticalFieldsBlocking();

    // 测试 2: Gate 替代方案选择
    await testGateAlternativeSelection();

    // 测试 3: 会话 TTL 刷新
    await testSessionTTLRefresh();

    // 测试 4: 完整流程测试
    await testCompleteFlow();

    logSection('测试完成');
    logSuccess('所有测试已完成');
    console.log('\n提示:');
    console.log('1. 设置 USER_TOKEN 环境变量以使用真实认证');
    console.log('2. 设置 BASE_URL 环境变量以指定服务地址（默认: http://localhost:3000）');
    console.log('3. 设置 API_PREFIX 环境变量以指定 API 前缀（默认: /api）\n');
  } catch (error: any) {
    logError(`测试过程中发生错误: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main().catch(console.error);
