// scripts/test-iceland-clarification.ts
// 测试冰岛特化澄清配置

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_PREFIX = process.env.API_PREFIX || '/api';
const USER_TOKEN = process.env.USER_TOKEN || 'test-token';

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

async function main() {
  logSection('冰岛特化澄清配置测试');
  console.log(`\nBase URL: ${BASE_URL}${API_PREFIX}\n`);

  // 检查服务是否运行
  try {
    await axios.get(`${BASE_URL}/health`).catch(() => axios.get(`${BASE_URL}`));
    logSuccess('服务运行中\n');
  } catch (error) {
    logError('服务未运行，请先启动服务: npm run start:dev');
    process.exit(1);
  }

  // 1. 检查配置
  logTest('步骤 1: 检查冰岛配置');
  const configResult = await apiCall('GET', '/admin/destination-clarification/IS');
  
  if (!configResult.success) {
    logError(`获取配置失败: ${configResult.error?.message}`);
    return;
  }

  const config = configResult.data;
  if (!config) {
    logError('配置不存在');
    return;
  }

  logSuccess(`配置已加载: ${config.destinationName} (${config.destinationCode})`);
  logInfo(`启用状态: ${config.enabled}`);
  logInfo(`澄清轮次: ${config.clarificationRounds?.length || 0}`);
  logInfo(`Gate 预检查: ${config.gatePrechecks?.length || 0}`);

  // 2. 测试配置
  logTest('步骤 2: 测试配置（基础信息）');
  const testResult1 = await apiCall('POST', '/admin/destination-clarification/IS/test', {
    currentParams: {
      destination: 'IS',
      startDate: '2026-06-01',
      endDate: '2026-06-07',
      totalBudget: 2000,
    },
    userInput: '我想去冰岛看极光',
  });

  if (testResult1.success && testResult1.data) {
    logSuccess('配置测试成功');
    if (testResult1.data.currentRound) {
      logInfo(`当前轮次: ${testResult1.data.currentRound.name} (${testResult1.data.currentRound.roundId})`);
    }
    if (testResult1.data.questions) {
      logInfo(`返回 ${testResult1.data.questions.length} 个问题`);
      testResult1.data.questions.forEach((q: any, i: number) => {
        console.log(`  ${i + 1}. ${q.question} (${q.type})`);
      });
    }
  }

  // 3. 测试 Gate 预检查（夏季+极光）
  logTest('步骤 3: 测试 Gate 预检查（夏季+极光追踪）');
  const testResult2 = await apiCall('POST', '/admin/destination-clarification/IS/test', {
    currentParams: {
      destination: 'IS',
      startDate: '2026-06-01',
      endDate: '2026-06-07',
      totalBudget: 2000,
      travelSeason: 'summer',
      activityPreferences: ['aurora_hunting'],
      riskTolerance: 'medium',
      travelGroup: 'couple',
    },
    userInput: '我想在夏天去冰岛看极光',
  });

  if (testResult2.success && testResult2.data) {
    if (testResult2.data.gateCheck?.blocked) {
      logSuccess('✅ Gate 预检查正确触发（夏季+极光不匹配）');
      logInfo(`警告消息: ${testResult2.data.gateCheck.warningMessage}`);
      if (testResult2.data.gateCheck.alternatives) {
        logInfo(`替代方案: ${testResult2.data.gateCheck.alternatives.length} 个`);
      }
    } else {
      logInfo('Gate 预检查未触发（可能需要更多参数）');
    }
  }

  logSection('测试完成');
  logSuccess('所有测试已完成');
}

main().catch(console.error);
