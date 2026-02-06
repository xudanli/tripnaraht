#!/usr/bin/env tsx
/**
 * Browserbase MCP 产品场景测试脚本
 * 
 * 基于产品经理设计的测试场景进行端到端测试
 */

// 加载环境变量
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env') });

import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_PREFIX = `${BASE_URL}/api/browserbase-mcp`;

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

interface ScenarioResult {
  scenario: string;
  success: boolean;
  steps: Array<{ name: string; success: boolean; error?: string; data?: any }>;
  duration: number;
}

const scenarioResults: ScenarioResult[] = [];

// 辅助函数：调用 API
async function callAPI(method: 'GET' | 'POST', endpoint: string, data?: any): Promise<any> {
  const config: any = {
    method,
    url: `${API_PREFIX}${endpoint}`,
    headers: { 'Content-Type': 'application/json' },
  };
  if (data) config.data = data;
  
  const response = await axios(config);
  if (response.data.success) {
    return response.data.data;
  } else {
    throw new Error(response.data.error?.message || 'API 调用失败');
  }
}

// 场景 1: 旅游网站内容抓取
async function scenario1_TravelWebsiteScraping(): Promise<ScenarioResult> {
  const startTime = Date.now();
  const scenario = '场景 1: 旅游网站内容抓取';
  const steps: ScenarioResult['steps'] = [];
  
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`📊 ${scenario}`, 'magenta');
  log(`${'='.repeat(60)}`, 'cyan');
  
  let sessionId: string | null = null;
  
  try {
    // 步骤 1: 创建浏览器会话
    log('\n📝 步骤 1: 创建浏览器会话', 'blue');
    try {
      const sessionData = await callAPI('POST', '/session/create', {
        url: 'https://example.com',
        viewport: { width: 1920, height: 1080 }
      });
      sessionId = sessionData.sessionId;
      steps.push({ name: '创建会话', success: true, data: sessionData });
      log(`   ✅ 会话创建成功: ${sessionId}`, 'green');
    } catch (error: any) {
      steps.push({ name: '创建会话', success: false, error: error.message });
      log(`   ❌ 创建会话失败: ${error.message}`, 'red');
      throw error;
    }
    
    // 步骤 2: 导航到目标页面
    log('\n📝 步骤 2: 导航到目标页面', 'blue');
    try {
      const navigateData = await callAPI('POST', '/navigate', {
        sessionId,
        url: 'https://example.com',
        waitUntil: 'load'
      });
      steps.push({ name: '导航', success: true, data: navigateData });
      log(`   ✅ 导航成功`, 'green');
    } catch (error: any) {
      steps.push({ name: '导航', success: false, error: error.message });
      log(`   ❌ 导航失败: ${error.message}`, 'red');
      throw error;
    }
    
    // 步骤 3: 执行 JavaScript 提取信息
    log('\n📝 步骤 3: 执行 JavaScript 提取信息', 'blue');
    try {
      const extractScript = `
        (() => {
          const title = document.querySelector('h1')?.textContent || '';
          const description = document.querySelector('p')?.textContent || '';
          return { title: title.trim(), description: description.substring(0, 100) };
        })();
      `;
      const evaluateData = await callAPI('POST', '/evaluate', {
        sessionId,
        script: extractScript
      });
      steps.push({ name: '提取信息', success: true, data: evaluateData });
      log(`   ✅ 信息提取成功`, 'green');
      log(`   数据: ${JSON.stringify(evaluateData, null, 2)}`, 'blue');
    } catch (error: any) {
      steps.push({ name: '提取信息', success: false, error: error.message });
      log(`   ❌ 信息提取失败: ${error.message}`, 'red');
    }
    
    // 步骤 4: 截图
    log('\n📝 步骤 4: 截图保存', 'blue');
    try {
      const screenshotData = await callAPI('POST', '/screenshot', {
        sessionId,
        fullPage: false,
        quality: 90
      });
      steps.push({ name: '截图', success: true, data: { hasImage: !!screenshotData.image } });
      log(`   ✅ 截图成功`, 'green');
      log(`   图片数据长度: ${screenshotData.image?.length || 0} 字符`, 'blue');
    } catch (error: any) {
      steps.push({ name: '截图', success: false, error: error.message });
      log(`   ❌ 截图失败: ${error.message}`, 'red');
    }
    
    const duration = Date.now() - startTime;
    const success = steps.every(s => s.success);
    
    return { scenario, success, steps, duration };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return { scenario, success: false, steps, duration };
  }
}

// 场景 2: 表单自动填写和提交
async function scenario2_FormAutoFill(): Promise<ScenarioResult> {
  const startTime = Date.now();
  const scenario = '场景 2: 表单自动填写和提交';
  const steps: ScenarioResult['steps'] = [];
  
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`📊 ${scenario}`, 'magenta');
  log(`${'='.repeat(60)}`, 'cyan');
  
  let sessionId: string | null = null;
  
  try {
    // 步骤 1: 创建会话
    log('\n📝 步骤 1: 创建浏览器会话', 'blue');
    try {
      const sessionData = await callAPI('POST', '/session/create', {
        url: 'https://example.com',
        viewport: { width: 1920, height: 1080 }
      });
      sessionId = sessionData.sessionId;
      steps.push({ name: '创建会话', success: true, data: sessionData });
      log(`   ✅ 会话创建成功: ${sessionId}`, 'green');
    } catch (error: any) {
      steps.push({ name: '创建会话', success: false, error: error.message });
      log(`   ❌ 创建会话失败: ${error.message}`, 'red');
      throw error;
    }
    
    // 步骤 2: 导航到表单页面
    log('\n📝 步骤 2: 导航到表单页面', 'blue');
    try {
      await callAPI('POST', '/navigate', {
        sessionId,
        url: 'https://example.com',
        waitUntil: 'load'
      });
      steps.push({ name: '导航', success: true });
      log(`   ✅ 导航成功`, 'green');
    } catch (error: any) {
      steps.push({ name: '导航', success: false, error: error.message });
      log(`   ❌ 导航失败: ${error.message}`, 'red');
      throw error;
    }
    
    // 步骤 3: 填写表单
    log('\n📝 步骤 3: 执行 JavaScript 填写表单', 'blue');
    try {
      const fillFormScript = `
        (() => {
          const inputs = document.querySelectorAll('input');
          if (inputs.length > 0) {
            inputs[0].value = '测试数据';
            inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            return { filled: true, count: inputs.length };
          }
          return { filled: false, message: '未找到输入框' };
        })();
      `;
      const evaluateData = await callAPI('POST', '/evaluate', {
        sessionId,
        script: fillFormScript
      });
      steps.push({ name: '填写表单', success: true, data: evaluateData });
      log(`   ✅ 表单填写成功`, 'green');
      log(`   结果: ${JSON.stringify(evaluateData, null, 2)}`, 'blue');
    } catch (error: any) {
      steps.push({ name: '填写表单', success: false, error: error.message });
      log(`   ❌ 表单填写失败: ${error.message}`, 'red');
    }
    
    const duration = Date.now() - startTime;
    const success = steps.every(s => s.success);
    
  return { scenario, success, steps, duration };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return { scenario, success: false, steps, duration };
  }
}

// 场景 3: 页面内容验证和截图
async function scenario3_ContentVerification(): Promise<ScenarioResult> {
  const startTime = Date.now();
  const scenario = '场景 3: 页面内容验证和截图';
  const steps: ScenarioResult['steps'] = [];
  
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`📊 ${scenario}`, 'magenta');
  log(`${'='.repeat(60)}`, 'cyan');
  
  let sessionId: string | null = null;
  
  try {
    // 步骤 1: 创建会话
    log('\n📝 步骤 1: 创建浏览器会话', 'blue');
    try {
      const sessionData = await callAPI('POST', '/session/create', {
        url: 'https://example.com',
        viewport: { width: 1920, height: 1080 }
      });
      sessionId = sessionData.sessionId;
      steps.push({ name: '创建会话', success: true, data: sessionData });
      log(`   ✅ 会话创建成功: ${sessionId}`, 'green');
    } catch (error: any) {
      steps.push({ name: '创建会话', success: false, error: error.message });
      log(`   ❌ 创建会话失败: ${error.message}`, 'red');
      throw error;
    }
    
    // 步骤 2: 导航并验证内容
    log('\n📝 步骤 2: 导航并验证页面内容', 'blue');
    try {
      await callAPI('POST', '/navigate', {
        sessionId,
        url: 'https://example.com',
        waitUntil: 'load'
      });
      
      const verifyScript = `
        (() => {
          const hasTitle = !!document.querySelector('h1');
          const hasContent = document.querySelectorAll('p').length > 0;
          return { hasTitle, hasContent, verified: hasTitle && hasContent };
        })();
      `;
      const verifyData = await callAPI('POST', '/evaluate', {
        sessionId,
        script: verifyScript
      });
      steps.push({ name: '验证内容', success: true, data: verifyData });
      log(`   ✅ 内容验证成功`, 'green');
      log(`   验证结果: ${JSON.stringify(verifyData, null, 2)}`, 'blue');
    } catch (error: any) {
      steps.push({ name: '验证内容', success: false, error: error.message });
      log(`   ❌ 内容验证失败: ${error.message}`, 'red');
    }
    
    // 步骤 3: 全页截图
    log('\n📝 步骤 3: 全页截图', 'blue');
    try {
      const screenshotData = await callAPI('POST', '/screenshot', {
        sessionId,
        fullPage: true,
        quality: 90
      });
      steps.push({ name: '全页截图', success: true, data: { hasImage: !!screenshotData.image } });
      log(`   ✅ 全页截图成功`, 'green');
      log(`   图片数据长度: ${screenshotData.image?.length || 0} 字符`, 'blue');
    } catch (error: any) {
      steps.push({ name: '全页截图', success: false, error: error.message });
      log(`   ❌ 全页截图失败: ${error.message}`, 'red');
    }
    
    const duration = Date.now() - startTime;
    const success = steps.every(s => s.success);
    
    return { scenario, success, steps, duration };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return { scenario, success: false, steps, duration };
  }
}

// 授权状态检查
async function checkAuthorizationBeforeTest(): Promise<boolean> {
  log('\n🔐 授权状态检查', 'cyan');
  
  // 尝试从环境变量获取 connectionId
  const connectionId = process.env.BROWSERBASE_MCP_CONNECTION_ID;
  
  if (!connectionId) {
    log('   ⚠️  未配置 BROWSERBASE_MCP_CONNECTION_ID', 'yellow');
    log('   💡 正在获取新的授权 URL...', 'blue');
    
    try {
      const authData = await callAPI('GET', '/auth/url');
      log(`\n   🔗 请访问以下 URL 完成授权:`, 'cyan');
      log(`   ${authData.authorizationUrl}`, 'blue');
      log(`\n   📝 授权完成后，更新 .env 文件:`, 'cyan');
      log(`   BROWSERBASE_MCP_CONNECTION_ID=${authData.connectionId}`, 'blue');
      log(`\n   ⚠️  然后重启服务器并重新运行测试`, 'yellow');
      return false;
    } catch (error: any) {
      log(`   ❌ 获取授权 URL 失败: ${error.message}`, 'red');
      return false;
    }
  }
  
  log(`   📋 当前 ConnectionId: ${connectionId}`, 'blue');
  
  try {
    const verifyResult = await callAPI('POST', '/auth/verify', { connectionId });
    
    if (verifyResult.isAuthorized) {
      log(`   ✅ 授权状态: 已授权`, 'green');
      return true;
    } else {
      log(`   ❌ 授权状态: 未授权`, 'red');
      log(`   💡 原因: ${verifyResult.message || '未知'}`, 'yellow');
      
      // 获取新的授权 URL
      try {
        const authData = await callAPI('GET', '/auth/url');
        log(`\n   🔗 请访问以下 URL 完成授权:`, 'cyan');
        log(`   ${authData.authorizationUrl}`, 'blue');
        log(`\n   📝 授权完成后，更新 .env 文件:`, 'cyan');
        log(`   BROWSERBASE_MCP_CONNECTION_ID=${authData.connectionId}`, 'blue');
        log(`\n   ⚠️  然后重启服务器并重新运行测试`, 'yellow');
      } catch (error: any) {
        log(`   ❌ 获取授权 URL 失败: ${error.message}`, 'red');
      }
      
      return false;
    }
  } catch (error: any) {
    log(`   ❌ 授权检查失败: ${error.message}`, 'red');
    log(`   💡 尝试获取新的授权 URL...`, 'yellow');
    
    try {
      const authData = await callAPI('GET', '/auth/url');
      log(`\n   🔗 请访问以下 URL 完成授权:`, 'cyan');
      log(`   ${authData.authorizationUrl}`, 'blue');
      log(`\n   📝 授权完成后，更新 .env 文件:`, 'cyan');
      log(`   BROWSERBASE_MCP_CONNECTION_ID=${authData.connectionId}`, 'blue');
      log(`\n   ⚠️  然后重启服务器并重新运行测试`, 'yellow');
    } catch (authError: any) {
      log(`   ❌ 获取授权 URL 失败: ${authError.message}`, 'red');
    }
    
    return false;
  }
}

// 主测试函数
async function main() {
  log('\n🚀 Browserbase MCP 产品场景测试', 'cyan');
  log(`📍 Base URL: ${BASE_URL}`, 'blue');
  log(`⏰ 开始时间: ${new Date().toLocaleString()}`, 'blue');
  
  // 前置检查：健康检查
  log('\n🔍 前置检查: 服务健康状态', 'cyan');
  try {
    const healthData = await callAPI('GET', '/health');
    log(`   ✅ 服务可用: ${healthData.available}`, 'green');
  } catch (error: any) {
    log(`   ❌ 服务不可用: ${error.message}`, 'red');
    log(`\n⚠️  请确保:`, 'yellow');
    log(`   1. 服务器正在运行 (${BASE_URL})`, 'yellow');
    log(`   2. OAuth 授权已完成`, 'yellow');
    log(`   3. 环境变量已正确配置`, 'yellow');
    process.exit(1);
  }
  
  // 授权状态检查
  const isAuthorized = await checkAuthorizationBeforeTest();
  if (!isAuthorized) {
    log(`\n${'='.repeat(60)}`, 'red');
    log(`❌ 测试终止: 需要完成 OAuth 授权`, 'red');
    log(`${'='.repeat(60)}`, 'red');
    log(`\n📋 下一步操作:`, 'yellow');
    log(`   1. 访问上面提供的授权 URL`, 'yellow');
    log(`   2. 完成 OAuth 授权流程`, 'yellow');
    log(`   3. 更新 .env 文件中的 BROWSERBASE_MCP_CONNECTION_ID`, 'yellow');
    log(`   4. 重启服务器`, 'yellow');
    log(`   5. 重新运行测试`, 'yellow');
    process.exit(1);
  }
  
  // 执行测试场景
  try {
    const scenario1 = await scenario1_TravelWebsiteScraping();
    scenarioResults.push(scenario1);
    
    const scenario2 = await scenario2_FormAutoFill();
    scenarioResults.push(scenario2);
    
    const scenario3 = await scenario3_ContentVerification();
    scenarioResults.push(scenario3);
  } catch (error: any) {
    log(`\n❌ 测试执行出错: ${error.message}`, 'red');
  }
  
  // 输出测试总结
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`📊 测试结果汇总`, 'magenta');
  log(`${'='.repeat(60)}`, 'cyan');
  
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalDuration = 0;
  
  scenarioResults.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    log(`\n${status} ${result.scenario}`, result.success ? 'green' : 'red');
    log(`   耗时: ${result.duration}ms`, 'blue');
    log(`   步骤: ${result.steps.filter(s => s.success).length}/${result.steps.length} 成功`, 'blue');
    
    result.steps.forEach((step, stepIndex) => {
      const stepStatus = step.success ? '  ✅' : '  ❌';
      log(`${stepStatus} ${step.name}`, step.success ? 'green' : 'red');
      if (!step.success && step.error) {
        log(`     错误: ${step.error}`, 'red');
      }
    });
    
    if (result.success) totalSuccess++;
    else totalFailed++;
    totalDuration += result.duration;
  });
  
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`总计: ${scenarioResults.length} 个场景`, 'cyan');
  log(`成功: ${totalSuccess}`, 'green');
  log(`失败: ${totalFailed}`, totalFailed > 0 ? 'red' : 'green');
  log(`总耗时: ${totalDuration}ms`, 'blue');
  log(`${'='.repeat(60)}`, 'cyan');
  
  process.exit(totalFailed > 0 ? 1 : 0);
}

// 运行测试
main().catch((error) => {
  log(`\n❌ 测试执行失败: ${error.message}`, 'red');
  process.exit(1);
});
