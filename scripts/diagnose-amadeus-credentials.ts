/**
 * Amadeus API 凭证诊断脚本
 * 全面检查凭证配置和有效性
 */

import * as dotenv from 'dotenv';
import * as https from 'https';

dotenv.config();

interface CredentialCheck {
  name: string;
  value: string | undefined;
  isValid: boolean;
  issue?: string;
}

async function checkCredentials(): Promise<void> {
  console.log('🔍 Amadeus API 凭证诊断\n');
  console.log('='.repeat(60));
  console.log();

  // 1. 检查环境变量
  console.log('📋 步骤 1: 检查环境变量\n');
  const checks: CredentialCheck[] = [
    {
      name: 'AMADEUS_CLIENT_ID',
      value: process.env.AMADEUS_CLIENT_ID,
      isValid: !!process.env.AMADEUS_CLIENT_ID,
    },
    {
      name: 'AMADEUS_CLIENT_SECRET',
      value: process.env.AMADEUS_CLIENT_SECRET,
      isValid: !!process.env.AMADEUS_CLIENT_SECRET,
    },
    {
      name: 'AMADEUS_API_KEY',
      value: process.env.AMADEUS_API_KEY,
      isValid: !!process.env.AMADEUS_API_KEY,
    },
    {
      name: 'AMADEUS_API_SECRET',
      value: process.env.AMADEUS_API_SECRET,
      isValid: !!process.env.AMADEUS_API_SECRET,
    },
    {
      name: 'AMADEUS_HOSTNAME',
      value: process.env.AMADEUS_HOSTNAME,
      isValid: true, // 可选
    },
  ];

  checks.forEach(check => {
    if (check.name.includes('SECRET')) {
      const masked = check.value 
        ? `${check.value.substring(0, 4)}...${check.value.substring(check.value.length - 4)}`
        : 'NOT SET';
      console.log(`  ${check.isValid ? '✅' : '❌'} ${check.name}: ${masked}`);
    } else {
      const masked = check.value 
        ? `${check.value.substring(0, 10)}...${check.value.substring(check.value.length - 4)}`
        : 'NOT SET';
      console.log(`  ${check.isValid ? '✅' : '❌'} ${check.name}: ${masked}`);
    }
  });

  // 确定使用的凭证
  const clientId = process.env.AMADEUS_CLIENT_ID || process.env.AMADEUS_API_KEY;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.AMADEUS_API_SECRET;
  const hostname = process.env.AMADEUS_HOSTNAME || 'test';

  console.log();
  console.log('📌 使用的凭证:');
  console.log(`  Client ID: ${clientId ? clientId.substring(0, 10) + '...' + clientId.substring(clientId.length - 4) : 'NOT SET'}`);
  console.log(`  Client Secret: ${clientSecret ? clientSecret.substring(0, 4) + '...' + clientSecret.substring(clientSecret.length - 4) : 'NOT SET'}`);
  console.log(`  Hostname: ${hostname}`);
  console.log();

  if (!clientId || !clientSecret) {
    console.log('❌ 错误: 未设置 Amadeus API 凭证');
    console.log('请在 .env 文件中设置:');
    console.log('  AMADEUS_CLIENT_ID=your-client-id');
    console.log('  AMADEUS_CLIENT_SECRET=your-client-secret');
    return;
  }

  // 2. 检查凭证格式
  console.log('📋 步骤 2: 检查凭证格式\n');
  
  const clientIdIssues: string[] = [];
  const clientSecretIssues: string[] = [];

  if (clientId.length < 10) {
    clientIdIssues.push('Client ID 太短（通常应该更长）');
  }
  if (clientId.includes(' ')) {
    clientIdIssues.push('Client ID 包含空格');
  }
  if (clientId.startsWith('[') || clientId.endsWith(']')) {
    clientIdIssues.push('Client ID 包含方括号（应该移除）');
  }

  if (clientSecret.length < 10) {
    clientSecretIssues.push('Client Secret 太短（通常应该更长）');
  }
  if (clientSecret.includes(' ')) {
    clientSecretIssues.push('Client Secret 包含空格');
  }
  if (clientSecret.startsWith('[') || clientSecret.endsWith(']')) {
    clientSecretIssues.push('Client Secret 包含方括号（应该移除）');
  }

  if (clientIdIssues.length === 0 && clientSecretIssues.length === 0) {
    console.log('  ✅ 凭证格式检查通过');
  } else {
    if (clientIdIssues.length > 0) {
      console.log('  ⚠️  Client ID 问题:');
      clientIdIssues.forEach(issue => console.log(`    - ${issue}`));
    }
    if (clientSecretIssues.length > 0) {
      console.log('  ⚠️  Client Secret 问题:');
      clientSecretIssues.forEach(issue => console.log(`    - ${issue}`));
    }
  }
  console.log();

  // 3. 测试凭证有效性
  console.log('📋 步骤 3: 测试凭证有效性\n');
  console.log(`  正在连接到 ${hostname === 'test' ? 'test.api.amadeus.com' : hostname}...\n`);

  await testAmadeusToken(clientId, clientSecret, hostname);

  // 4. 检查 MCP 连接配置
  console.log();
  console.log('📋 步骤 4: 检查 MCP 连接配置\n');
  console.log('  MCP URL: https://server.smithery.ai/@almogqwinz/mcp-amadeus-api');
  console.log('  配置传递方式: 查询参数 + headers');
  console.log('  查询参数: amadeusClientId, amadeusClientSecret, amadeusHostname');
  console.log('  Headers: amadeus-client-id, amadeus-client-secret');
  console.log();
}

function testAmadeusToken(
  clientId: string,
  clientSecret: string,
  hostname: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const apiHost = hostname === 'test' ? 'test.api.amadeus.com' : hostname;
    
    const postData = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
    
    const options = {
      hostname: apiHost,
      path: '/v1/security/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length.toString(),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          
          if (json.access_token) {
            console.log('  ✅ 凭证有效！成功获取 access token');
            console.log(`  Token 类型: ${json.token_type}`);
            console.log(`  过期时间: ${json.expires_in} 秒`);
            console.log(`  Token 前缀: ${json.access_token.substring(0, 20)}...`);
            resolve();
          } else {
            console.log('  ❌ 凭证无效');
            console.log(`  错误代码: ${json.code || 'N/A'}`);
            console.log(`  错误: ${json.error || 'N/A'}`);
            console.log(`  错误描述: ${json.error_description || 'N/A'}`);
            console.log(`  标题: ${json.title || 'N/A'}`);
            console.log();
            console.log('  💡 可能的原因:');
            console.log('    1. Client ID 或 Secret 不正确');
            console.log('    2. 凭证已过期或被撤销');
            console.log('    3. 使用了错误环境的凭证（测试 vs 生产）');
            console.log('    4. 凭证格式有问题（包含特殊字符或空格）');
            console.log();
            console.log('  🔧 建议操作:');
            console.log('    1. 访问 https://developers.amadeus.com/');
            console.log('    2. 登录并检查您的应用凭证');
            console.log('    3. 确认使用的是测试环境的凭证');
            console.log('    4. 如有需要，重新生成 API Key 和 Secret');
            resolve();
          }
        } catch (e) {
          console.log('  ❌ 解析响应失败');
          console.log(`  原始响应: ${data.substring(0, 500)}`);
          resolve();
        }
      });
    });

    req.on('error', (e) => {
      console.log(`  ❌ 请求失败: ${e.message}`);
      console.log('  可能的原因:');
      console.log('    1. 网络连接问题');
      console.log('    2. API 端点不可访问');
      resolve();
    });

    req.setTimeout(10000, () => {
      req.destroy();
      console.log('  ❌ 请求超时');
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

checkCredentials().catch(console.error);
