// scripts/test-destination-clarification-apis.ts
// TypeScript 版本的 API 测试脚本

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const USER_TOKEN = process.env.USER_TOKEN || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

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
};

async function testApi(
  name: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  data?: any,
  headers: Record<string, string> = {}
): Promise<void> {
  console.log(colors.yellow(`\n${name}`));
  console.log(`${method} ${url}`);
  
  try {
    const config: any = {
      method,
      url: `${BASE_URL}${url}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    const result: ApiResponse = response.data;
    
    if (result.success) {
      console.log(colors.green('✅ 成功'));
      console.log(JSON.stringify(result.data, null, 2));
      return result.data;
    } else {
      console.log(colors.red(`❌ 失败: ${result.error?.message || 'Unknown error'}`));
      console.log(JSON.stringify(result.error, null, 2));
    }
  } catch (error: any) {
    if (error.response) {
      console.log(colors.red(`❌ HTTP ${error.response.status}`));
      console.log(JSON.stringify(error.response.data, null, 2));
    } else {
      console.log(colors.red(`❌ 错误: ${error.message}`));
    }
  }
}

async function main() {
  console.log('==========================================');
  console.log('目的地特化澄清系统 - API 测试');
  console.log('==========================================');
  console.log(`\nBase URL: ${BASE_URL}\n`);
  
  // 检查服务是否运行
  try {
    await axios.get(`${BASE_URL}/health`).catch(() => axios.get(`${BASE_URL}`));
    console.log(colors.green('✅ 服务运行中\n'));
  } catch (error) {
    console.log(colors.red('❌ 服务未运行，请先启动服务: npm run start:dev'));
    process.exit(1);
  }
  
  // ==================== 管理侧接口测试 ====================
  
  console.log(colors.blue('========================================'));
  console.log(colors.blue('管理侧接口测试'));
  console.log(colors.blue('========================================\n'));
  
  // 1. 获取所有配置列表
  await testApi(
    '1. 获取所有配置列表',
    'GET',
    '/admin/destination-clarification',
    undefined,
    ADMIN_TOKEN ? { Authorization: `Bearer ${ADMIN_TOKEN}` } : {}
  );
  
  // 2. 获取格陵兰配置
  const glConfig = await testApi(
    '2. 获取格陵兰配置',
    'GET',
    '/admin/destination-clarification/GL'
  ) as any;
  
  if (glConfig?.enabled) {
    console.log(colors.green('✅ 格陵兰配置已启用'));
  } else {
    console.log(colors.yellow('⚠️  格陵兰配置未启用'));
  }
  
  // 3. 测试配置
  const testResult = await testApi(
    '3. 测试格陵兰配置',
    'POST',
    '/admin/destination-clarification/GL/test',
    {
      currentParams: {
        destination: 'GL',
        startDate: '2025-07-01',
        endDate: '2025-07-10',
        totalBudget: 50000,
      },
      userInput: '我想去东格陵兰远征',
    }
  ) as any;
  
  if (testResult?.currentRound) {
    console.log(colors.green(`✅ 当前轮次: ${testResult.currentRound.name}`));
  }
  if (testResult?.questions?.length > 0) {
    console.log(colors.green(`✅ 返回 ${testResult.questions.length} 个澄清问题`));
  }
  
  // ==================== 用户侧接口测试 ====================
  
  if (!USER_TOKEN) {
    console.log(colors.red('\n⚠️  USER_TOKEN 未设置，跳过需要认证的接口'));
    console.log(colors.yellow('提示: 设置 USER_TOKEN 环境变量以测试用户侧接口\n'));
    return;
  }
  
  console.log(colors.blue('\n========================================'));
  console.log(colors.blue('用户侧接口测试'));
  console.log(colors.blue('========================================\n'));
  
  // 4. 自然语言创建行程 - 第一轮
  const createResult = await testApi(
    '4. 自然语言创建行程 - 第一轮（基础信息）',
    'POST',
    '/trips/from-natural-language',
    {
      text: '我想去格陵兰，7月份，预算5万',
    },
    { Authorization: `Bearer ${USER_TOKEN}` }
  ) as any;
  
  const sessionId = createResult?.sessionId;
  if (sessionId) {
    console.log(colors.green(`✅ Session ID: ${sessionId}`));
  }
  
  if (createResult?.needsClarification) {
    console.log(colors.green('✅ 需要澄清'));
    const questionsCount = createResult.clarificationQuestions?.length || 0;
    console.log(colors.green(`✅ 返回 ${questionsCount} 个澄清问题`));
    
    // 5. 继续对话
    if (sessionId) {
      await testApi(
        '5. 继续对话 - 回答澄清问题',
        'POST',
        '/trips/from-natural-language',
        {
          text: '我的极地经验是：有1-2次北极/高山经验，风险承受度：接受高风险，活动类型：冰川徒步',
          sessionId,
        },
        { Authorization: `Bearer ${USER_TOKEN}` }
      );
    }
    
    // 6. 获取对话上下文
    if (sessionId) {
      const contextResult = await testApi(
        '6. 获取对话上下文',
        'GET',
        `/trips/nl-conversation/${sessionId}`,
        undefined,
        { Authorization: `Bearer ${USER_TOKEN}` }
      ) as any;
      
      if (contextResult?.messages) {
        const messagesCount = contextResult.messages.length;
        console.log(colors.green(`✅ 对话历史包含 ${messagesCount} 条消息`));
      }
    }
  } else if (createResult?.trip) {
    console.log(colors.green(`✅ 行程创建成功: ${createResult.trip.id}`));
  }
  
  console.log('\n========================================');
  console.log(colors.green('✅ 测试完成'));
  console.log('========================================\n');
  
  console.log('提示:');
  console.log('1. 设置 USER_TOKEN 环境变量以测试用户侧接口');
  console.log('2. 设置 ADMIN_TOKEN 环境变量以测试管理侧接口');
  console.log('3. 设置 BASE_URL 环境变量以指定服务地址（默认: http://localhost:3000）\n');
}

main().catch(console.error);
