#!/usr/bin/env ts-node

/**
 * Planning Assistant V2 - MCP 服务自然语言调用测试脚本
 * 
 * 测试所有 MCP 服务的自然语言调用功能
 */

import axios from 'axios';

// 配置
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/agent/planning-assistant/v2`;
const USER_ID = `test_user_${Date.now()}`;

// 测试结果
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  response?: any;
}

const results: TestResult[] = [];
let sessionId: string = '';

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

function printHeader(text: string) {
  log('\n' + '━'.repeat(80), 'blue');
  log(`  ${text}`, 'blue');
  log('━'.repeat(80), 'blue');
}

function printTest(name: string) {
  log(`\n📋 测试: ${name}`, 'cyan');
}

function printSuccess(message: string) {
  log(`✅ ${message}`, 'green');
}

function printFailure(message: string) {
  log(`❌ ${message}`, 'red');
}

function printInfo(message: string) {
  log(`ℹ️  ${message}`, 'yellow');
}

// 检查服务器是否运行
async function checkServer(): Promise<boolean> {
  try {
    await axios.get(`${BASE_URL}/health`, { timeout: 2000 });
    return true;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return false;
    }
    // 如果 /health 不存在，尝试访问根路径
    try {
      await axios.get(`${BASE_URL}/`, { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }
}

// 创建会话
async function createSession(): Promise<string> {
  printHeader('创建会话');
  
  // 先检查服务器是否运行（但不强制要求）
  printInfo('检查服务器连接...');
  const serverRunning = await checkServer();
  if (!serverRunning) {
    printFailure('健康检查失败，但将继续尝试创建会话...');
    printInfo('如果创建会话失败，请确保服务器正在运行:');
    printInfo('  npm run dev');
    printInfo('  或');
    printInfo('  npm run backend:dev');
  } else {
    printSuccess('服务器连接正常');
  }
  
  try {
    const response = await axios.post(`${API_BASE}/sessions`, {
      userId: USER_ID,
    }, { timeout: 10000 });
    
    const sessionId = response.data.sessionId;
    if (!sessionId) {
      throw new Error('会话ID为空');
    }
    
    printSuccess(`会话创建成功: ${sessionId}`);
    return sessionId;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      printFailure('无法连接到服务器，请确保服务器正在运行');
      printInfo('启动服务器: npm run dev');
    } else {
      printFailure(`创建会话失败: ${error.message}`);
      if (error.response) {
        console.error('响应:', JSON.stringify(error.response.data, null, 2));
      }
    }
    throw error;
  }
}

// 测试端点
async function testEndpoint(
  name: string,
  message: string,
  expectedTarget: string,
  expectedField?: string
): Promise<TestResult> {
  printTest(name);
  printInfo(`输入: "${message}"`);
  printInfo(`期望路由: ${expectedTarget}`);
  if (expectedField) {
    printInfo(`期望字段: ${expectedField}`);
  }
  
  try {
    const response = await axios.post(`${API_BASE}/chat`, {
      sessionId,
      userId: USER_ID,
      message,
      language: 'zh',
    });
    
    const data = response.data;
    
    // 检查路由目标
    const actualTarget = data.routing?.target || 'chat';
    if (actualTarget !== expectedTarget) {
      const error = `路由目标不匹配: 期望 '${expectedTarget}', 实际 '${actualTarget}'`;
      printFailure(error);
      console.error('响应:', JSON.stringify(data, null, 2));
      return {
        name,
        passed: false,
        error,
        response: data,
      };
    }
    
    // 检查响应字段
    if (expectedField) {
      const fieldValue = expectedField.split('.').reduce((obj: any, key: string) => obj?.[key], data);
      if (!fieldValue) {
        const error = `响应中缺少字段: ${expectedField}`;
        printFailure(error);
        console.error('响应:', JSON.stringify(data, null, 2));
        return {
          name,
          passed: false,
          error,
          response: data,
        };
      }
      
      // 如果是数组，显示数量
      if (Array.isArray(fieldValue)) {
        printInfo(`返回数据数量: ${fieldValue.length}`);
      }
    }
    
    // 检查消息字段
    if (!data.messageCN && !data.message) {
      const error = '响应中缺少 messageCN 或 message 字段';
      printFailure(error);
      return {
        name,
        passed: false,
        error,
        response: data,
      };
    }
    
    printSuccess('测试通过');
    printInfo(`路由目标: ${actualTarget}`);
    printInfo(`响应消息: ${data.messageCN || data.message}`);
    
    return {
      name,
      passed: true,
      response: data,
    };
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message;
    printFailure(`请求失败: ${errorMessage}`);
    
    if (error.response?.data) {
      console.error('错误响应:', JSON.stringify(error.response.data, null, 2));
    }
    
    return {
      name,
      passed: false,
      error: errorMessage,
      response: error.response?.data,
    };
  }
}

// 主测试流程
async function main() {
  log('\n╔══════════════════════════════════════════════════════════════════════════════╗', 'blue');
  log('║  Planning Assistant V2 - MCP 服务自然语言调用测试                            ║', 'blue');
  log('╚══════════════════════════════════════════════════════════════════════════════╝', 'blue');
  
  printInfo(`API 基础 URL: ${API_BASE}`);
  printInfo(`用户 ID: ${USER_ID}`);
  
  // 创建会话
  try {
    sessionId = await createSession();
  } catch (error) {
    log('\n❌ 无法创建会话，测试终止', 'red');
    process.exit(1);
  }
  
  // 测试所有 MCP 服务
  log('\n开始测试 MCP 服务自然语言调用...', 'yellow');
  
  // 1. 酒店搜索
  results.push(await testEndpoint(
    '酒店搜索 (Hotel Direct API)',
    '推荐冰岛的酒店',
    'hotel',
    'hotels'
  ));
  
  // 等待一下，避免请求过快
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 2. Airbnb 搜索
  results.push(await testEndpoint(
    'Airbnb 搜索 (Airbnb MCP)',
    '推荐 Airbnb 房源',
    'airbnb',
    'airbnbListings'
  ));
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 3. 住宿搜索（酒店+Airbnb）
  results.push(await testEndpoint(
    '住宿搜索 (Hotel + Airbnb)',
    '推荐住宿',
    'accommodation',
    'hotels'
  ));
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 4. 餐厅搜索
  results.push(await testEndpoint(
    '餐厅搜索 (Restaurant Direct API)',
    '推荐餐厅',
    'restaurant',
    'restaurants'
  ));
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 5. 天气查询
  results.push(await testEndpoint(
    '天气查询 (Weather Direct API)',
    '冰岛天气怎么样',
    'weather',
    'weather'
  ));
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 6. Web 搜索
  results.push(await testEndpoint(
    'Web 搜索 (Exa MCP)',
    '搜索冰岛旅游攻略',
    'search',
    'searchResults'
  ));
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 7. 航班搜索
  results.push(await testEndpoint(
    '航班搜索 (Amadeus MCP)',
    '搜索从北京到上海的航班',
    'flight',
    'flights'
  ));
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 8. 铁路查询
  results.push(await testEndpoint(
    '铁路查询 (Rail MCP)',
    '查询从巴黎到伦敦的火车',
    'rail',
    'railRoutes'
  ));
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 9. 翻译服务
  results.push(await testEndpoint(
    '翻译服务 (Translation Direct API)',
    '翻译一下 Hello World',
    'translate',
    'translation'
  ));
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 10. 货币转换
  results.push(await testEndpoint(
    '货币转换 (Currency Direct API)',
    '100美元换人民币',
    'currency',
    'currencyConversion'
  ));
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 11. 图片搜索
  results.push(await testEndpoint(
    '图片搜索 (Image Direct API)',
    '找一些冰岛的图片',
    'image',
    'images'
  ));
  
  // 打印测试结果汇总
  printHeader('测试结果汇总');
  
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  log(`总测试数: ${total}`);
  log(`通过: ${passed}`, 'green');
  log(`失败: ${failed}`, 'red');
  
  // 显示失败的测试详情
  if (failed > 0) {
    log('\n失败的测试:', 'red');
    results.filter(r => !r.passed).forEach(result => {
      log(`  - ${result.name}: ${result.error}`, 'red');
    });
  }
  
  // 显示通过的测试
  if (passed > 0) {
    log('\n通过的测试:', 'green');
    results.filter(r => r.passed).forEach(result => {
      log(`  ✅ ${result.name}`, 'green');
    });
  }
  
  // 退出码
  if (failed === 0) {
    log('\n🎉 所有测试通过！', 'green');
    process.exit(0);
  } else {
    log(`\n⚠️  有 ${failed} 个测试失败`, 'red');
    process.exit(1);
  }
}

// 运行测试
main().catch(error => {
  log(`\n❌ 测试执行失败: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
