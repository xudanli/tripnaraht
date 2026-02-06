/**
 * Amadeus API 测试脚本（带重试功能）
 * 用于测试新创建的 API 密钥是否已激活
 * 如果密钥需要等待激活，会自动重试
 */

import * as dotenv from 'dotenv';
import * as https from 'https';

dotenv.config();

interface RetryOptions {
  maxRetries: number;
  retryDelay: number; // 秒
  initialDelay: number; // 秒
}

async function testAmadeusToken(
  clientId: string,
  clientSecret: string,
  hostname: string
): Promise<{ success: boolean; error?: string; token?: string }> {
  return new Promise((resolve) => {
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
      timeout: 10000,
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
            resolve({ success: true, token: json.access_token });
          } else {
            resolve({ 
              success: false, 
              error: json.error_description || json.error || 'Unknown error' 
            });
          }
        } catch (e) {
          resolve({ success: false, error: 'Failed to parse response' });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ success: false, error: e.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });

    req.write(postData);
    req.end();
  });
}

async function sleep(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function testWithRetry(options: RetryOptions = {
  maxRetries: 12, // 最多重试 12 次（约 1 小时）
  retryDelay: 300, // 每次重试间隔 5 分钟
  initialDelay: 0, // 立即开始第一次测试
}): Promise<void> {
  console.log('🧪 Amadeus API 凭证测试（带重试功能）\n');
  console.log('='.repeat(60));
  console.log();

  const clientId = process.env.AMADEUS_CLIENT_ID || process.env.AMADEUS_API_KEY;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.AMADEUS_API_SECRET;
  const hostname = process.env.AMADEUS_HOSTNAME || 'test';

  if (!clientId || !clientSecret) {
    console.log('❌ 错误: 未设置 Amadeus API 凭证');
    console.log('请在 .env 文件中设置:');
    console.log('  AMADEUS_CLIENT_ID=your-client-id');
    console.log('  AMADEUS_CLIENT_SECRET=your-client-secret');
    return;
  }

  console.log('📋 测试配置:');
  console.log(`  Client ID: ${clientId.substring(0, 10)}...${clientId.substring(clientId.length - 4)}`);
  console.log(`  Client Secret: ${clientSecret.substring(0, 4)}...${clientSecret.substring(clientSecret.length - 4)}`);
  console.log(`  Hostname: ${hostname}`);
  console.log(`  最大重试次数: ${options.maxRetries}`);
  console.log(`  重试间隔: ${options.retryDelay} 秒（${options.retryDelay / 60} 分钟）`);
  console.log();

  if (options.initialDelay > 0) {
    console.log(`⏳ 等待 ${options.initialDelay} 秒后开始测试...\n`);
    await sleep(options.initialDelay);
  }

  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    console.log(`🔄 尝试 ${attempt}/${options.maxRetries}...`);
    
    const result = await testAmadeusToken(clientId, clientSecret, hostname);
    
    if (result.success) {
      console.log('✅ 成功！API 密钥已激活');
      console.log(`  获取到 access token: ${result.token?.substring(0, 20)}...`);
      console.log();
      console.log('💡 现在可以运行 MCP 测试:');
      console.log('   npm run test:amadeus:search');
      return;
    } else {
      const isInvalidClient = result.error?.includes('invalid_client') || 
                              result.error?.includes('Client credentials are invalid');
      
      if (isInvalidClient && attempt < options.maxRetries) {
        const waitMinutes = options.retryDelay / 60;
        const totalMinutes = (attempt * options.retryDelay) / 60;
        console.log(`❌ 凭证验证失败: ${result.error}`);
        console.log(`⏳ API 密钥可能尚未激活，等待 ${waitMinutes} 分钟后重试...`);
        console.log(`   已等待: ${totalMinutes.toFixed(1)} 分钟`);
        console.log(`   建议: 新创建的 API 密钥通常需要 30 分钟才能激活`);
        console.log();
        
        await sleep(options.retryDelay);
      } else {
        console.log(`❌ 测试失败: ${result.error}`);
        if (attempt >= options.maxRetries) {
          console.log();
          console.log('💡 已达到最大重试次数');
          console.log('   可能的原因:');
          console.log('   1. API 密钥尚未激活（请再等待一段时间）');
          console.log('   2. 凭证不正确（请检查 Amadeus 控制台）');
          console.log('   3. 使用了错误环境的凭证');
          console.log();
          console.log('🔧 建议操作:');
          console.log('   1. 确认 API 密钥创建时间（如果刚创建，请等待 30 分钟）');
          console.log('   2. 检查 Amadeus 开发者控制台中的凭证');
          console.log('   3. 确认使用的是测试环境的凭证');
        }
        return;
      }
    }
  }
}

// 解析命令行参数
const args = process.argv.slice(2);
const options: RetryOptions = {
  maxRetries: 12, // 默认最多重试 12 次（1 小时）
  retryDelay: 300, // 默认每次间隔 5 分钟
  initialDelay: 0, // 立即开始
};

// 支持命令行参数
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--max-retries' && args[i + 1]) {
    options.maxRetries = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--retry-delay' && args[i + 1]) {
    options.retryDelay = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--initial-delay' && args[i + 1]) {
    options.initialDelay = parseInt(args[i + 1], 10);
    i++;
  }
}

testWithRetry(options).catch(console.error);
